"""Smart Food Bank Fridge - test bench: try each feature by itself, no ElevenLabs.

    python fridge_testbench.py               # webcam window with one button per feature
    python fridge_testbench.py --camera 1    # pick the webcam (or press C to cycle)
    python fridge_testbench.py --no-gemini   # never call Gemini

Nothing here starts a voice session or spends ElevenLabs credits. Each button
runs exactly the function Nourish calls during a donation and prints what it
would hand back to the agent, plus how long it took.
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import re
import sys
import threading
import time
import uuid
import tkinter as tk
from typing import Callable, Optional

import cv2
import numpy as np
from dotenv import load_dotenv
from PIL import Image, ImageTk

import fridge_voice_agent as voice
from fridge_local_vision import LocalVision
from fridge_data import FridgeData, condition_summary
from fridge_ui import ACCENT, BG, FONT, MAX_CAMERA_INDEX, MUTED, PANEL, TEXT, VIDEO_INTERVAL_MS, WARN, Camera

log = logging.getLogger("fridge.testbench")


class TestBench:
    def __init__(
        self,
        camera: Camera,
        vision: LocalVision,
        gemini,
        mic: Optional[int],
        speaker: Optional[int],
        auditor=None,
        shelf_camera: Optional[Camera] = None,
    ):
        self.auditor = auditor
        self.data = FridgeData()
        if self.auditor is not None:
            self.auditor.expected_provider = lambda: [{"name": r["canonical_name"], "count": int(r["recorded_quantity"])} for r in self.data.inventory() if r["recorded_quantity"] > 0]
        self._donation_id = str(uuid.uuid4())
        self._sensor_updates = queue.Queue()
        self._sensor_stop = threading.Event()
        self.shelf_camera = shelf_camera
        self._shelf_photo = None
        # The item the last scan found, waiting for "Add to log": (name, count) or None.
        self._item: Optional[tuple[str, int]] = None
        self._item_shown: object = ()
        self.camera = camera
        self.vision = vision
        self.gemini = gemini
        self.mic = mic
        self.speaker = speaker
        self._lines: queue.Queue[tuple[str, str]] = queue.Queue()  # (text, tag) from worker threads
        self._busy = threading.Lock()
        self._buttons: list[tk.Button] = []
        self._photo = None
        self._catalog_photo = None
        self._catalog_stamp = None
        self._closing = False

        if sys.platform == "win32":
            try:
                import ctypes

                ctypes.windll.shcore.SetProcessDpiAwareness(1)
            except Exception:
                pass
        self.root = tk.Tk()
        self.root.title("Nourish · Hardware + Vision Test Bench")
        self.root.configure(bg=BG)
        scale = self.root.winfo_fpixels("1i") / 96.0
        self.root.geometry(f"{min(int(1280 * scale),self.root.winfo_screenwidth()-60)}x{min(int(860 * scale),self.root.winfo_screenheight()-100)}")
        self._scale = scale

        # Background results from the vision module arrive on its threads.
        vision._on_second_opinion = lambda kind, first, second: self._say(f"[background] {kind} check: {second}", "note")
        vision._on_product = self._on_product

        side = tk.Frame(self.root, bg=BG, width=int(330 * scale))
        side.pack(side="right", fill="y", padx=(0, 16), pady=14)
        side.pack_propagate(False)

        def section(title: str) -> None:
            tk.Label(side, text=title, font=(FONT, 10, "bold"), fg=MUTED, bg=BG, anchor="w").pack(fill="x", pady=(12, 3))

        def button(label: str, action: Callable[[], None]) -> None:
            widget = tk.Button(
                side, text=label, font=(FONT, 11), bg=PANEL, fg=TEXT, activebackground=ACCENT, relief="flat",
                anchor="w", padx=12, pady=5, command=lambda: self._run(label, action),
            )
            widget.pack(fill="x", pady=2)
            self._buttons.append(widget)

        section("CAMERA  (hold the item up, then click)")
        button("Scan item  (Gemini first, then on-device)", self._scan_item)
        button("Read expiration date  (OCR)", self._scan_date)
        button("Scan barcode  (+ catalog lookup)", self._scan_barcode)
        button("Analyze this frame now  (no waiting)", self._analyze_frame)
        section("GEMINI  (1 request each, free tier is small)")
        button("Gemini: identify item in frame", self._gemini_identify)
        button("Gemini: full product details", self._gemini_details)
        button("Gemini scan -> find in catalog", self._gemini_catalog)
        section("CATALOG  (type below, then click)")
        self.entry = tk.Entry(side, font=(FONT, 11), bg=PANEL, fg=TEXT, insertbackground=TEXT, relief="flat")
        self.entry.pack(fill="x", ipady=5)
        self.entry.insert(0, "3017624010701")
        button("Look up barcode number", self._lookup_barcode)
        button("Search product by name", self._search_catalog)
        section("SHELF CAMERA  (checks the log against the shelves)")
        button("Show what is in the log", self._show_log)
        button("Run shelf audit now", self._run_audit)
        button("Confirm typed donation  ('2 x beans')", self._add_expected)
        button("Open full sensor monitor", self._open_sensor_monitor)
        section("AUDIO")
        button("Play test tone on speaker", self._test_speaker)
        button("Measure mic level  (3 s)", self._test_mic)
        self.log_box = tk.Text(
            self.root, height=11, bg=PANEL, fg=TEXT, font=("Consolas", 10), relief="flat", wrap="word", padx=10, pady=8
        )
        self.log_box.pack(side="bottom", fill="x", padx=16, pady=(8, 14))
        self.log_box.tag_configure("head", foreground=ACCENT, font=("Consolas", 10, "bold"))
        self.log_box.tag_configure("note", foreground=MUTED)
        self.log_box.tag_configure("bad", foreground=WARN)
        self.log_box.configure(state="disabled")

        # Below the pictures: what the last scan found, its store photo, and the log.
        strip = tk.Frame(self.root, bg=PANEL)
        strip.pack(side="bottom", fill="x", padx=16, pady=(8, 0))
        self.catalog_photo = tk.Label(strip, bg=PANEL, fg=MUTED, font=(FONT, 9), compound="top")
        self.catalog_photo.pack(side="left", padx=10, pady=8)
        middle = tk.Frame(strip, bg=PANEL)
        middle.pack(side="left", fill="both", expand=True, pady=8)
        self.item_label = tk.Label(
            middle, text="Scanned item: nothing yet", font=(FONT, 11, "bold"), fg=TEXT, bg=PANEL, anchor="w", justify="left"
        )
        self.item_label.pack(fill="x")
        self.add_button = tk.Button(
            middle, text="Confirm placed donation", font=(FONT, 11, "bold"), bg=ACCENT, fg="#06210f", activebackground=ACCENT,
            disabledforeground="#4b5b52", relief="flat", padx=14, pady=4, state="disabled", command=lambda:self._run('Confirm placed donation',self._add_scanned),
        )
        self.add_button.pack(anchor="w", pady=(6, 6))
        self.ledger_label = tk.Label(
            middle, text="", font=(FONT, 10), fg=MUTED, bg=PANEL, anchor="w", justify="left"
        )
        self.ledger_label.pack(fill="x")
        middle.bind("<Configure>", lambda event: [w.configure(wraplength=max(200, event.width - 20)) for w in (self.item_label, self.ledger_label)])

        self.sensor_label=tk.Label(self.root,text='Connecting to Tiger Data sensors…',font=(FONT,10),bg=PANEL,fg=TEXT,anchor='w',justify='left',wraplength=850,padx=10,pady=8)
        self.sensor_label.pack(side='top',fill='x',padx=16,pady=(10,0))
        videos = tk.Frame(self.root, bg=BG)
        videos.pack(fill="both", expand=True, padx=16, pady=(14, 0))
        videos.columnconfigure(0, weight=1, uniform="cam")
        videos.columnconfigure(1, weight=1, uniform="cam")
        videos.rowconfigure(1, weight=1)
        self.video_title = tk.Label(videos, text="", font=(FONT, 10, "bold"), fg=MUTED, bg=BG, anchor="w")
        self.video_title.grid(row=0, column=0, sticky="w")
        self.shelf_title = tk.Label(videos, text="", font=(FONT, 10, "bold"), fg=MUTED, bg=BG, anchor="w")
        self.shelf_title.grid(row=0, column=1, sticky="w", padx=(8, 0))
        self.video = tk.Label(videos, bg="black", fg=MUTED, font=(FONT, 12))
        self.video.grid(row=1, column=0, sticky="nsew", padx=(0, 4))
        self.shelf_video = tk.Label(videos, bg="black", fg=MUTED, font=(FONT, 12))
        self.shelf_video.grid(row=1, column=1, sticky="nsew", padx=(4, 0))

        self.root.bind("<Key-c>", self._cycle_camera)
        self.root.bind("<Key-C>", self._cycle_camera)
        self.root.bind("<Key-v>", self._cycle_shelf_camera)
        self.root.bind("<Key-V>", self._cycle_shelf_camera)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self._say("Loading the on-device models...", "note")
        threading.Thread(target=self._warm_up, daemon=True).start()
        if self.auditor is not None:
            self.auditor._on_report=self._save_audit

    # -- features ------------------------------------------------------------
    def _scan_item(self) -> None:
        self._item = None
        result = self.vision.identify_item()
        self._result(result, empty="nothing recognised (Nourish would ask for the barcode)")
        self._item_from_scan_text(result)

    def _scan_date(self) -> None:
        self._result(self.vision.read_expiry(), empty="no date read (Nourish would ask the donor to read it out)")

    def _scan_barcode(self) -> None:
        self._item = None
        result = self.vision.scan_barcode()
        self._result(result)
        self._item_from_scan_text(result)

    def _analyze_frame(self) -> None:
        frame = self._frame()
        report = self.vision.analyze_image(frame)
        self.vision.overlay = (time.monotonic() + 3.0, report["boxes"])  # keep the boxes up for a few seconds
        self._say(f"text ({report['ocr_seconds']} s): {report['text_lines'] or 'none'}")
        self._say(f"objects ({report['detect_seconds']} s): {report['objects'] or 'none'}")
        self._say(f"barcode: {report['barcode'] or 'none in view'}")
        self._say(f"expiry date: {report['expiry_date'] or 'none found'}")

    def _gemini_identify(self) -> None:
        self._item = None
        result = self._need_gemini().identify_frame(self._frame())
        self._result(result, empty="Gemini saw no food item")
        found = re.match(r"(\d+) x (.+?)(?: \(.*\))?$", result or "")  # "2 x canned black beans (sealed)"
        if found:
            self._item = (found.group(2), int(found.group(1)))

    def _gemini_details(self) -> None:
        details = self._need_gemini().product_metadata(self._frame())
        for key, value in details.items():
            self._say(f"{key:13s} {value}")
        if not details:
            self._say("Gemini saw no food item", "bad")
        self._item = self._item_from_details(details)

    def _gemini_catalog(self) -> None:
        self._need_gemini()
        self._item = None
        self._result(self.vision.find_in_catalog(self._frame()), empty="Gemini saw no food item")
        self._item = self._item_from_details(self.vision.last_details or {})
        catalog = (self.vision.last_details or {}).get("catalog")
        self._say(f"catalog listing: {catalog or 'none found'}", "" if catalog else "bad")

    def _lookup_barcode(self) -> None:
        code = "".join(ch for ch in self.entry.get() if ch.isdigit())
        if not code:
            raise ValueError("type the barcode digits in the box first")
        match, note = self.vision._lookup_barcode(code)
        self._result(match or note.strip())
        self._item = self._item_from_product(self.vision.last_product) if match else None
        self._show_listing(self.vision.last_product if match else None, "by barcode")

    def _search_catalog(self) -> None:
        query = self.entry.get().strip()
        if not query:
            raise ValueError("type a product name in the box first")
        product = self.vision.catalog.search(query)
        self._result(str(product) if product else "", empty="no close catalog listing")
        self._item = self._item_from_product(product) if product else None
        self._show_listing(product, "text search, not verified")

    def _add_expected(self) -> None:
        text = self.entry.get().strip()
        count, _, name = text.partition("x")
        if not (count.strip().isdigit() and name.strip()):
            raise ValueError("type it as:  2 x canned black beans")
        self.data.confirm_donation(name.strip(),int(count),operation_id=self._donation_id)
        self._donation_id=str(uuid.uuid4())
        self.auditor.add_expected(name.strip(), int(count))
        self._say('Confirmed donation saved in Tiger Data.', 'note')
        self._say(f"log: {self._ledger_text()}")

    def _show_log(self) -> None:
        """List every item the shelf camera will look for, and what the last check found."""
        items = [dict(item) for item in self.auditor.expected]
        if not items:
            self._say("The log is empty. Scan an item and press 'Add to log', or type one in the box.", "bad")
        for number, item in enumerate(items, start=1):
            self._say(f"  {number}. {item['count']} x {item['name']}")
        if items:
            self._say(f"  {sum(item['count'] for item in items)} item(s) in {len(items)} line(s)", "note")
        last = self.auditor.last_report
        if last:
            self._say(f"  last check {last['time'][11:19]}: {last['status']} - {last['headline']}", "note")
        else:
            self._say("  no shelf check has run yet", "note")

    def _clear_log(self) -> None:
        self.auditor.clear_expected()
        self._say("log cleared")

    def _add_scanned(self) -> None:
        """The "Add to log" button under the pictures: the last scanned item goes into the log."""
        if self._item is None:
            return
        name, count = self._item
        details=self.vision.last_details or {'catalog':self.vision.last_product or {}}
        self.data.confirm_donation(name,count,details,operation_id=self._donation_id)
        self._donation_id=str(uuid.uuid4())
        self.auditor.add_expected(name, count)
        self._item = None  # one click, one entry: scan again to add another
        self._say(f"\n> Saved confirmed donation to Tiger Data: {count} x {name}", "head")
        self._say(f"log: {self._ledger_text()}", "note")

    def _ledger_text(self) -> str:
        return ", ".join(f"{item['count']} x {item['name']}" for item in self.auditor.expected) or "empty"

    # -- which item did a scan find? ---------------------------------------------
    @staticmethod
    def _item_from_details(details: dict) -> Optional[tuple[str, int]]:
        """(name, count) from a Gemini reading, falling back to its catalog listing."""
        if details.get("fridge_ok") in ("no", "unsure") or details.get("is_food") is False:
            return None  # flagged as possibly not belonging in the fridge: not something to log
        catalog = details.get("catalog") or {}
        name = " ".join(str(details[key]) for key in ("brand", "variant", "product_name", "size") if details.get(key))
        name = name or " ".join(part for part in (catalog.get("brand"), catalog.get("name"), catalog.get("size")) if part)
        if name and details.get("photo_shows_pack_of") is not None:
            name += " (single item from a pack)"  # logged as individual items, not as packs
        return (name, max(1, int(details.get("count") or 1))) if name else None

    @staticmethod
    def _item_from_product(product: Optional[dict]) -> Optional[tuple[str, int]]:
        if not product:
            return None
        name = product.get("name") or ""
        if product.get("brand") and product["brand"].lower() not in name.lower():
            name = f"{product['brand']} {name}"
        return (" ".join(part for part in (name, product.get("size")) if part), 1) if name else None

    def _item_from_scan_text(self, result: str) -> None:
        """Work out the item from what a camera scan handed back (the same text Nourish gets)."""
        if not result:
            return
        counted = re.search(r"(?:items|containers) held up: (\d+)|Looks like: (\d+) x", result)
        count = int(next(group for group in counted.groups() if group)) if counted else 1
        if result.startswith("Barcode ") and "matched" in result:
            item = self._item_from_product(self.vision.last_product)
            self._item = (item[0], count) if item else None
        elif "The camera reads it as" in result:  # the Gemini route answered
            self._item = self._item_from_details(self.vision.last_details or {})
        else:
            produce = re.search(r"Looks like: \d+ x ([a-z ]+)\.", result)
            label = re.search(r"largest first: (.+?)\. (?:Number|Could|Looks|A barcode)", result)
            words = [w for w in (label.group(1).split(" | ") if label else []) if not re.search(r"\d", w)][:3]
            name = produce.group(1) if produce else " ".join(words).title()
            # Provisional: the background lookup replaces it with the proper product name.
            self._item = (name, count) if name else None

    def _run_audit(self) -> None:
        self._sync_inventory()
        looking_for = [dict(item) for item in self.auditor.expected]
        self._say(f"checking the shelf camera for: {self._ledger_text()}", "note")
        report = self.auditor.audit_now()
        if report["status"] in ("ok", "discrepancy"):
            short = {m["name"]: m for m in report["missing"]}
            for item in looking_for:
                if item["name"] in report["unclear"]:
                    self._say(f"   ?  {item['name']}: could not tell", "note")
                elif item["name"] in short:
                    self._say(f"   X  {item['name']}: saw {short[item['name']]['seen']} of {item['count']}", "bad")
                else:
                    self._say(f"   OK {item['name']}: all {item['count']} there")
        self._say(f"{report['status'].upper()}: {report['headline']}", "bad" if report["status"] == "discrepancy" else "")
        if report["summary"]:
            self._say(f"sees: {report['summary']}", "note")
        if report["unclear"]:
            self._say(f"could not count: {report['unclear']}", "note")
        self._say(f"expected from now on: {report['expected_now']}", "note")

    def _test_speaker(self) -> None:
        import sounddevice as sd

        tone = (np.sin(np.arange(16_000) * 2 * np.pi * 440 / 16_000) * 6000).astype(np.int16)
        sd.play(tone, 16_000, device=self.speaker, blocking=True)
        name = sd.query_devices(self.speaker if self.speaker is not None else sd.default.device[1])["name"]
        self._say(f"played a 1 s tone on: {name}")

    def _test_mic(self) -> None:
        import sounddevice as sd

        self._say("recording 3 s - talk now...", "note")
        audio = sd.rec(48_000, samplerate=16_000, channels=1, dtype="int16", device=self.mic, blocking=True)
        samples = audio.astype(np.float32)
        chunks = samples[: len(samples) // 4000 * 4000].reshape(-1, 4000)
        levels = np.sqrt((chunks**2).mean(axis=1))
        name = sd.query_devices(self.mic if self.mic is not None else sd.default.device[0])["name"]
        self._say(f"mic: {name}")
        self._say(f"level (RMS): quietest {levels.min():.0f}, loudest {levels.max():.0f}")
        self._say(f"echo gate is {voice.DEFAULT_GATE_RMS:.0f}: speech should peak above it, speaker echo below", "note")

    # -- plumbing --------------------------------------------------------------
    def _run(self, label: str, action: Callable[[], None]) -> None:
        if not self._busy.acquire(blocking=False):
            return
        for widget in self._buttons:
            widget.configure(state="disabled")
        self._say(f"\n> {label}", "head")

        def work() -> None:
            started = time.monotonic()
            try:
                action()
            except Exception as exc:
                self._say(f"FAILED: {exc}", "bad")
            self._say(f"({time.monotonic() - started:.1f} s)", "note")
            self._lines.put(("", "done"))
            self._busy.release()

        threading.Thread(target=work, daemon=True).start()

    def _warm_up(self) -> None:
        try:
            self.vision.warm_up()
            self._say("Ready. Gemini is " + ("available as backup." if self.gemini else "off."), "note")
        except Exception as exc:
            self._say(f"On-device models failed to load: {exc}", "bad")

    def _frame(self) -> np.ndarray:
        frame = self.camera.get_frame()
        if frame is None:
            raise RuntimeError(f"no picture from camera {self.camera.index} (press C to switch)")
        return frame

    def _need_gemini(self):
        if self.gemini is None:
            raise RuntimeError("Gemini is off (no GEMINI_API_KEY, or started with --no-gemini)")
        return self.gemini

    def _result(self, text: str, empty: str = "") -> None:
        self._say(text or empty, "" if text else "bad")

    def _say(self, text: str, tag: str = "") -> None:
        self._lines.put((text, tag))

    def _on_product(self, details: dict) -> None:
        if details.get("fridge_ok") in ("no", "unsure") or details.get("is_food") is False:
            self._item = None  # nothing to add to the log
            self._say(f"CHECK THIS ITEM: {details.get('object_seen')} - {details.get('concern')}", "bad")
            return
        better = self._item_from_details(details)
        if better:  # the proper product name replaces the provisional one from the label text
            self._item = (better[0], better[1] if details.get("count") else (self._item or better)[1])
        self._say("[background] product details:", "note")
        for key, value in details.items():
            if value not in (None, "", []):
                self._say(f"    {key:21s} {value}", "note")

    def _show_listing(self, product: Optional[dict], how: str) -> None:
        """Fetch and show a catalog listing's photo (used by the two catalog buttons)."""
        if not product:
            return
        # "barcode" here only means "download it, don't run the photo-vs-camera
        # comparison": there is no held item to compare a typed lookup against.
        photo = self.vision._check_catalog_photo(product, "barcode", self._blank(), {}, "")
        if photo:
            self.vision.product_photo = (time.monotonic(), photo["image"], f"Catalog photo - {how}")
        else:
            self._say("this listing has no photo", "note")

    @staticmethod
    def _blank() -> np.ndarray:
        return np.zeros((8, 8, 3), np.uint8)

    # -- main-thread loops -----------------------------------------------------
    def run(self) -> None:
        self.camera.start()
        if self.shelf_camera is not None:
            self.shelf_camera.start()
        self.root.after(VIDEO_INTERVAL_MS, self._tick_video)
        self.root.after(60, self._tick_log)
        threading.Thread(target=self._poll_sensors,daemon=True,name='tiger-monitor').start()
        self.root.after(200,self._tick_sensors)
        self.root.mainloop()

    def close(self) -> None:
        self._closing = True
        self._sensor_stop.set()
        if self.auditor is not None:self.auditor.stop()
        self.camera.stop()
        if self.shelf_camera is not None:
            self.shelf_camera.stop()
        self.root.destroy()

    def _open_sensor_monitor(self):
        import webbrowser
        webbrowser.open(self.data.base_url+'/monitor')

    def _sync_inventory(self):
        items=self.data.inventory()
        with self.auditor._lock:
            self.auditor.expected=[{'name':r['canonical_name'],'count':r['recorded_quantity']} for r in items if r['recorded_quantity']>0]

    def _save_audit(self,report):
        try:
            saved=self.data.save_audit(report)
            if saved:self._say('Shelf observation saved in Tiger Data; recorded stock was not changed.','note')
        except Exception as exc:self._say(f'Shelf observation NOT saved: {exc}','bad')

    def _poll_sensors(self):
        while not self._sensor_stop.is_set():
            try:self._sensor_updates.put(condition_summary(self.data.conditions()))
            except Exception as exc:self._sensor_updates.put('Sensor data unavailable: '+str(exc))
            self._sensor_stop.wait(2)

    def _tick_sensors(self):
        if self._closing:return
        try:
            while True:self.sensor_label.configure(text=self._sensor_updates.get_nowait())
        except queue.Empty:pass
        self.root.after(200,self._tick_sensors)

    def _tick_video(self) -> None:
        if self._closing:
            return
        frame = self.camera.get_frame()
        width, height = self.video.winfo_width(), self.video.winfo_height()
        if frame is None:
            self._photo = None
            self.video.configure(image="", text=f"No picture from camera {self.camera.index}\n(press C to try the next one)")
        elif width > 10 and height > 10:
            stamp, boxes = self.vision.overlay
            if time.monotonic() - stamp < 0.8:
                for x1, y1, x2, y2, label in boxes:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (128, 222, 74), 2)
                    cv2.putText(frame, str(label)[:28], (x1, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (128, 222, 74), 2)
            ratio = min(width / frame.shape[1], height / frame.shape[0])
            size = (max(1, int(frame.shape[1] * ratio)), max(1, int(frame.shape[0] * ratio)))
            rgb = cv2.cvtColor(cv2.resize(frame, size, interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
            self._photo = ImageTk.PhotoImage(Image.fromarray(rgb))
            self.video.configure(image=self._photo, text="")
        self.video_title.configure(text=f"DONOR CAMERA  (camera {self.camera.index}, C to switch)")
        self._tick_shelf_video()
        self.root.after(VIDEO_INTERVAL_MS, self._tick_video)

    def _tick_shelf_video(self) -> None:
        if self.shelf_camera is None:
            self.shelf_title.configure(text="SHELF CAMERA  (none: the audit uses the donor camera)")
            return
        self.shelf_title.configure(text=f"SHELF CAMERA  (camera {self.shelf_camera.index}, V to switch)")
        frame = self.shelf_camera.get_frame()
        width, height = self.shelf_video.winfo_width(), self.shelf_video.winfo_height()
        if frame is None:
            self._shelf_photo = None
            self.shelf_video.configure(
                image="", text=f"No picture from camera {self.shelf_camera.index}\n(press V to try the next one)"
            )
        elif width > 10 and height > 10:
            ratio = min(width / frame.shape[1], height / frame.shape[0])
            size = (max(1, int(frame.shape[1] * ratio)), max(1, int(frame.shape[0] * ratio)))
            rgb = cv2.cvtColor(cv2.resize(frame, size, interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
            self._shelf_photo = ImageTk.PhotoImage(Image.fromarray(rgb))
            self.shelf_video.configure(image=self._shelf_photo, text="")

    def _tick_log(self) -> None:
        if self._closing:
            return
        try:
            while True:
                text, tag = self._lines.get_nowait()
                if tag == "done":
                    for widget in self._buttons:
                        widget.configure(state="normal")
                    continue
                self.log_box.configure(state="normal")
                self.log_box.insert("end", text + "\n", tag)
                self.log_box.see("end")
                self.log_box.configure(state="disabled")
        except queue.Empty:
            pass
        # The scanned item and the log, as the worker threads last left them.
        state = (self._item, self._ledger_text() if self.auditor else "")
        if state != self._item_shown:
            self._item_shown = state
            if self._item:
                self.item_label.configure(text=f"Scanned item:  {self._item[1]} x {self._item[0]}")
                self.add_button.configure(state="normal", text=f"Confirm placed donation  ({self._item[1]} x)")
            else:
                self.item_label.configure(text="Scanned item: nothing yet (scan something, then add it to the log)")
                self.add_button.configure(state="disabled", text="Confirm placed donation")
            self.ledger_label.configure(text=f"Log (what the shelf camera checks for):  {state[1]}")
        photo = self.vision.product_photo
        if (photo[0] if photo else None) != self._catalog_stamp:
            self._catalog_stamp = photo[0] if photo else None
            if photo:
                _stamp, image, caption = photo
                height = int(110 * self._scale)
                size = (max(1, int(image.shape[1] * height / image.shape[0])), height)
                to_rgb = cv2.COLOR_BGRA2RGBA if image.shape[2] == 4 else cv2.COLOR_BGR2RGB
                rgb = cv2.cvtColor(cv2.resize(image, size, interpolation=cv2.INTER_AREA), to_rgb)
                self._catalog_photo = ImageTk.PhotoImage(Image.fromarray(rgb))
                self.catalog_photo.configure(image=self._catalog_photo, text=caption)
            else:  # a new scan started: the old picture no longer applies
                self._catalog_photo = None
                self.catalog_photo.configure(image="", text="")
        self.root.after(60, self._tick_log)

    def _cycle_camera(self, event) -> None:
        if event.widget is not self.entry:
            self.camera._exclude = self.shelf_camera.index if self.shelf_camera else None
            self.camera.switch((self.camera.index + 1) % (MAX_CAMERA_INDEX + 1))

    def _cycle_shelf_camera(self, event) -> None:
        if event.widget is not self.entry and self.shelf_camera is not None:
            self.shelf_camera._exclude = self.camera.index  # one camera, one job
            self.shelf_camera.switch((self.shelf_camera.index + 1) % (MAX_CAMERA_INDEX + 1))


def main() -> int:
    parser = argparse.ArgumentParser(description="Test each fridge feature by itself, without ElevenLabs")
    parser.add_argument("--camera", type=int, default=int(os.getenv("FRIDGE_CAMERA_INDEX", "0")), help="webcam index")
    parser.add_argument("--no-gemini", action="store_true", help="never call Gemini")
    parser.add_argument(
        "--inventory-camera", type=int, default=None,
        help="second camera, pointed at the shelves (default: the next camera after --camera)",
    )
    parser.add_argument("--local-first", action="store_true", help="scan items with the on-device models first (default: Gemini first)")
    parser.add_argument("--one-camera", action="store_true", help="no shelf camera: audit what the donor camera shows")
    parser.add_argument("--mic", default=os.getenv("FRIDGE_MIC_DEVICE", "Logitech"))
    parser.add_argument("--speaker", default=os.getenv("FRIDGE_SPEAKER_DEVICE", "JBL"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")

    shelf_index = None
    if not args.one_camera:
        shelf_index = args.inventory_camera if args.inventory_camera is not None else (args.camera + 1) % (MAX_CAMERA_INDEX + 1)
        if shelf_index == args.camera:
            parser.error("--inventory-camera must be a different camera from --camera")
    camera = Camera(args.camera, exclude=shelf_index)
    # The shelf camera stays where it is put: it must never drift onto the donor camera.
    shelf_camera = Camera(shelf_index, auto_select=False, exclude=args.camera) if shelf_index is not None else None
    gemini = None
    if os.getenv("GEMINI_API_KEY") and not args.no_gemini:
        from fridge_vision import GeminiVision

        gemini = GeminiVision(camera.get_frame)
    vision = LocalVision(camera.get_frame, fallback=gemini, prefer_gemini=not args.local_first)
    from fridge_inventory import InventoryAuditor

    # The audit looks at the live shelf preview (or, with one camera, at the donor camera's picture).
    source = shelf_camera or camera
    auditor = InventoryAuditor(source.index, gemini=gemini, capture=source.get_frame)
    TestBench(
        camera, vision, gemini, voice.resolve_device(args.mic, "input"), voice.resolve_device(args.speaker, "output"),
        auditor, shelf_camera,
    ).run()
    return 0


if __name__ == "__main__":
    load_dotenv(voice.ENV_PATH)
    sys.exit(main())
