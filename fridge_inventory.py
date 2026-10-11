"""Smart Food Bank Fridge - recurring shelf audits from a second camera.

Every few minutes a camera pointed at the shelves takes one picture and it is
compared with what was scanned in at the front:

  * items that were scanned in but are no longer visible,
  * items on the shelves that were never scanned in,
  * spills, leaks and broken packaging.

    auditor = InventoryAuditor(camera_index=1, gemini=GeminiVision(...), on_report=print)
    agent.on_donation_logged(auditor.add_donation)   # what should be inside
    auditor.start()                                  # first audit now, then every 5 minutes

What an audit can and cannot say
--------------------------------
A missing item is an observation, not an accusation: this is a community
fridge, and people taking food is the point of it. The report says "fewer
than scanned in", and why that might be, and leaves the judgement to a person.

Each difference is reported once. After a usable audit, what the camera saw
becomes the new baseline, so the same missing can is not re-announced every
five minutes for the rest of the day. A dark, blocked or blurred picture
changes nothing: the last good baseline stands and the report says so.
"""

from __future__ import annotations

import json
import logging
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

log = logging.getLogger("fridge.inventory")

AUDIT_INTERVAL_S = 30.0
AUDIT_DIR = Path(__file__).with_name("audits")
LEDGER_PATH = Path(__file__).with_name("inventory_ledger.json")
# Every scheduled or manual check analyzes a fresh camera image.
CHANGED_PIXEL_FRACTION = 0.03
MIN_BRIGHTNESS = 18.0  # mean grey level below which the picture is "too dark to tell"
CAMERA_WARMUP_S = 2.5  # webcams send black / badly exposed frames at first


class InventoryAuditor:
    def __init__(
        self,
        camera_index: int,
        gemini=None,
        on_report: Optional[Callable[[dict], None]] = None,
        interval_s: float = AUDIT_INTERVAL_S,
        capture: Optional[Callable[[], Optional[np.ndarray]]] = None,
        expected_provider=None,
    ):
        """`capture` replaces the webcam grab (tests, or a camera you already hold open)."""
        self.expected_provider = expected_provider
        self.camera_index = camera_index
        self.interval_s = interval_s
        self._gemini = gemini
        self._on_report = on_report
        self._capture = capture or self._grab_from_camera
        self._lock = threading.Lock()
        self._audit_lock = threading.Lock()
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_analysed: Optional[np.ndarray] = None  # small grey copy of the last frame Gemini saw
        self._last_analysed_at = 0.0
        self._ledger_dirty = True  # something was scanned in since the last analysis
        self.expected: list[dict] = self._load_ledger()  # [{"name", "count"}]: the baseline
        self.last_report: Optional[dict] = None

    # -- what should be inside -------------------------------------------------
    def add_donation(self, record: dict) -> None:
        """Hook for `agent.on_donation_logged`: add a logged donation to the expected inventory."""
        products = [product for product in record.get("products") or [] if product]
        count = max(1, int(record.get("item_count") or 1))
        if len(products) == 1:
            # One scanned product: use its precise name ("Red Bull Zero Energy Drink 8.4 fl oz").
            details = products[0]
            catalog = details.get("catalog") or {}
            name = " ".join(str(details[key]) for key in ("brand", "variant", "product_name", "size") if details.get(key))
            name = name or " ".join(part for part in (catalog.get("brand"), catalog.get("name"), catalog.get("size")) if part)
            if name and details.get("photo_shows_pack_of") is not None:
                name += " (single item from a pack)"  # the count is individual items, not packs
        else:
            name = ""
        self.add_expected(name or str(record.get("items") or "unspecified item"), count)

    def add_expected(self, name: str, count: int = 1) -> None:
        with self._lock:
            for item in self.expected:
                if item["name"].lower() == name.lower():
                    item["count"] += count
                    break
            else:
                self.expected.append({"name": name, "count": count})
            self._ledger_dirty = True
            self._save_ledger()
        log.info("expected inventory += %d x %s", count, name)

    def clear_expected(self) -> None:
        """Forget everything that was scanned in (start the log over)."""
        with self._lock:
            self.expected = []
            self._ledger_dirty = True
            self._save_ledger()

    # -- running -------------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name="inventory-audit", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def audit_soon(self) -> None:
        """Run the next audit now instead of waiting out the interval."""
        self._wake.set()

    def _loop(self) -> None:
        if self._stop.wait(CAMERA_WARMUP_S): return
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                self.audit_now()
            except Exception as exc:  # one bad audit must not end the schedule
                log.exception("Inventory audit crashed: %s", exc)
            self._wake.wait(max(1, self.interval_s - (time.monotonic() - started)))
            self._wake.clear()

    # -- one audit -------------------------------------------------------------
    def audit_now(self) -> dict:
        """Capture and analyze a fresh shelf image; never overlap model calls."""
        with self._audit_lock:
            return self._audit_once()

    def _audit_once(self):
        started = datetime.now(timezone.utc)
        report = {
            "time": started.isoformat(timespec="seconds"),
            "status": "",  # ok | discrepancy | unchanged | unusable | unavailable
            "headline": "",
            "missing": [],  # [{"name", "expected", "seen"}]
            "unexpected": [],  # [{"name", "count"}]
            "unclear": [],  # expected items the camera could not count
            "spill": "",
            "summary": "",
            "snapshot": "",
        }
        if self.expected_provider is not None:
            try:
                items = self.expected_provider()
                with self._lock:
                    if items != self.expected:
                        self._ledger_dirty = True
                    self.expected = items
            except Exception:
                return self._finish(report, "unavailable", "Recorded inventory unavailable; shelf check deferred.")
        frame = self._capture()
        if frame is None:
            return self._finish(report, "unusable", f"Shelf camera {self.camera_index} gave no picture.")
        brightness = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean())
        if brightness < MIN_BRIGHTNESS:
            return self._finish(report, "unusable", "The shelf picture is too dark to check. Last inventory stands.")

        small = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(frame, (320, 180)), cv2.COLOR_BGR2GRAY), (5, 5), 0)
        with self._lock:
            expected = [dict(item) for item in self.expected]
            dirty = self._ledger_dirty
            previous = self._last_analysed
        if self._gemini is None:
            return self._finish(report, "unavailable", "The shelves changed, but no vision model is configured to check them.")
        try:
            result = self._gemini.audit_shelves(frame, expected)
        except Exception as exc:
            log.warning("Shelf audit could not be analysed: %s", exc)
            return self._finish(report, "unavailable", "The shelves changed, but the vision service is unavailable. Will retry.")
        if not result.get("image_usable"):
            problem = result.get("image_problem") or "the picture does not show the shelves clearly"
            return self._finish(report, "unusable", f"Nothing could be made out in the picture ({problem}). Last inventory stands.")

        report["snapshot"] = self._save_snapshot(frame, started)
        report["summary"] = str(result.get("summary") or "")
        report["spill"] = str(result.get("spill_description") or "a spill or mess is visible") if result.get("spill_detected") else ""
        seen = {str(row.get("name") or "").lower(): row.get("seen_count") for row in result.get("expected") or []}
        new_baseline = []
        observed_items = []
        for item in expected:
            count = seen.get(item["name"].lower())
            if count is None:
                report["unclear"].append(item["name"])  # hidden or uncountable: keep expecting it
                new_baseline.append(item)
                continue
            count = max(0, int(count))
            observed_items.append({"name": item["name"], "count": count})
            if count < item["count"]:
                report["missing"].append({"name": item["name"], "expected": item["count"], "seen": count})
            if count > 0:
                new_baseline.append({"name": item["name"], "count": count})
        for row in result.get("unexpected") or []:
            name, count = str(row.get("name") or "").strip(), max(1, int(row.get("count") or 1))
            if name:
                report["unexpected"].append({"name": name, "count": count})
                new_baseline.append({"name": name, "count": count})
                observed_items.append({"name": name, "count": count})

        # What the camera saw is the baseline from here on: each difference is reported once.
        with self._lock:
            added_meanwhile = [item for item in self.expected if item["name"].lower() not in {e["name"].lower() for e in expected}]
            if self.expected_provider is None:
                self.expected = new_baseline + added_meanwhile
            report["observed_items"] = observed_items
            self._ledger_dirty = bool(added_meanwhile)
            self._last_analysed = small
            self._last_analysed_at = time.monotonic()
            self._save_ledger()

        parts = []
        if report["spill"]:
            parts.append(f"SPILL: {report['spill']}")
        if report["missing"]:
            gone = ", ".join(f"{m['name']} ({m['seen']} of {m['expected']})" for m in report["missing"])
            parts.append(f"Fewer than scanned in: {gone}. This may be a normal pickup, or something hidden from view.")
        if report["unexpected"]:
            extra = ", ".join(f"{u['count']} x {u['name']}" for u in report["unexpected"])
            parts.append(f"In view but not in the log: {extra}.")
        if parts:
            return self._finish(report, "discrepancy", " ".join(parts))
        return self._finish(report, "ok", "Everything in the log was found.")

    # -- plumbing --------------------------------------------------------------
    def _finish(self, report: dict, status: str, headline: str) -> dict:
        report["status"], report["headline"] = status, headline
        with self._lock:
            report["expected_now"] = [dict(item) for item in self.expected]
        self.last_report = report
        log.info("inventory audit: %s - %s", status, headline)
        if status in ("ok", "discrepancy"):  # only analysed audits are worth keeping on disk
            try:
                AUDIT_DIR.mkdir(exist_ok=True)
                name = "audit_" + report["time"].replace(":", "").replace("-", "") + ".json"
                (AUDIT_DIR / name).write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
            except OSError as exc:
                log.warning("Could not save the audit report: %s", exc)
        if self._on_report is not None:
            try:
                self._on_report(report)
            except Exception as exc:
                log.warning("Audit report handler failed: %s", exc)
        return report

    def _grab_from_camera(self) -> Optional[np.ndarray]:
        """Open the shelf camera, let it settle, take one frame, release it.

        The camera is only held for a few seconds every interval, which
        keeps the USB bus and CPU free for the donor-facing camera.
        """
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        capture = cv2.VideoCapture(self.camera_index, backend)
        if not capture.isOpened():
            capture.release()
            return None
        try:
            capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            frame = None
            deadline = time.monotonic() + CAMERA_WARMUP_S
            while time.monotonic() < deadline:
                ok, grabbed = capture.read()
                if ok:
                    frame = grabbed  # keep the newest: exposure settles over the first frames
            return frame
        finally:
            capture.release()

    @staticmethod
    def _save_snapshot(frame: np.ndarray, when: datetime) -> str:
        """Keep the shelf picture next to its report (shelves only: this camera never faces people)."""
        try:
            AUDIT_DIR.mkdir(exist_ok=True)
            path = AUDIT_DIR / f"audit_{when:%Y%m%dT%H%M%S}.jpg"
            cv2.imwrite(str(path), cv2.resize(frame, (960, int(frame.shape[0] * 960 / frame.shape[1]))))
            return str(path)
        except Exception as exc:
            log.warning("Could not save the shelf snapshot: %s", exc)
            return ""

    @staticmethod
    def _load_ledger() -> list[dict]:
        try:
            data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
            return [{"name": str(i["name"]), "count": int(i["count"])} for i in data if i.get("name")]
        except FileNotFoundError:
            return []
        except Exception as exc:
            log.warning("Could not read %s (%s): starting with an empty inventory.", LEDGER_PATH.name, exc)
            return []

    def _save_ledger(self) -> None:
        try:
            LEDGER_PATH.write_text(json.dumps(self.expected, indent=1, ensure_ascii=False), encoding="utf-8")
        except OSError as exc:
            log.warning("Could not save the inventory ledger: %s", exc)
