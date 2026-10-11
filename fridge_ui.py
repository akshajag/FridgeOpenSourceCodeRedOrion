"""Smart Food Bank Fridge - demo window: live webcam + Nourish's captions.

    python fridge_ui.py                 # voice session with the window
    python fridge_ui.py --camera 1      # pick the webcam (or press C in the window to cycle)
    python fridge_ui.py --text          # no mic/speaker: type in the box at the bottom

The window owns the webcam. The Gemini step should read frames from
`ui.camera.get_frame()` rather than opening the camera a second time
(Windows gives a webcam to one reader at a time).
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import sys
import threading
import time
import tkinter as tk
from typing import Optional

import cv2
import numpy as np
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from PIL import Image, ImageTk
from fridge_data import FridgeData, condition_summary

import fridge_voice_agent as voice

log = logging.getLogger("fridge.ui")

BG = "#0f1419"
PANEL = "#18212b"
TEXT = "#f2f5f7"
MUTED = "#8b98a5"
ACCENT = "#4ade80"
WARN = "#fbbf24"
FONT = "Segoe UI"
MAX_CAMERA_INDEX = 3  # C cycles through 0..3
VIDEO_INTERVAL_MS = 66  # ~15 fps preview


class Camera:
    """Reads the webcam on its own thread and keeps only the newest frame."""

    def __init__(self, index: int = 0, auto_select: bool = True, exclude: Optional[int] = None):
        self.index = index
        self._auto_select = auto_select  # skip cameras that only deliver black frames
        self._exclude = exclude  # a camera with another job (the shelf camera): never switch onto it
        self.mirror_horizontal = os.getenv("FRIDGE_FRONT_MIRROR", "0") == "1" if index == int(os.getenv("FRIDGE_CAMERA_INDEX", "0")) else os.getenv("FRIDGE_SHELF_MIRROR", "0") == "1"
        self._frame: Optional[np.ndarray] = None
        self._frame_at = 0.0
        self._lock = threading.Lock()
        self._running = threading.Event()
        self._reopen = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._running.set()
        self._thread = threading.Thread(target=self._loop, name="camera", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._thread:
            self._thread.join(timeout=2.0)

    def switch(self, index: int) -> None:
        self._auto_select = False  # the user chose: respect it even if it is dark
        if index == self._exclude:
            index = (index + 1) % (MAX_CAMERA_INDEX + 1)
        self.index = index
        self._reopen.set()

    def get_frame(self) -> Optional[np.ndarray]:
        """Latest frame as a BGR array (a copy), or None if the camera has no picture."""
        with self._lock:
            return None if self._frame is None or time.monotonic() - self._frame_at > 2 else self._frame.copy()

    def _open(self):
        # DirectShow opens in well under a second; the default MSMF backend can take ~10 s.
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_AVFOUNDATION if sys.platform == "darwin" else cv2.CAP_ANY
        capture = cv2.VideoCapture(self.index, backend)
        if not capture.isOpened():
            capture.release()
            return None
        # 1080p, because a barcode's thinnest bars need every pixel they can
        # get; MJPG because uncompressed 1080p does not fit down USB 2.
        capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        capture.set(cv2.CAP_PROP_FPS, 30)
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return capture

    def _loop(self) -> None:
        capture = None
        black_since: Optional[float] = None
        tried = 0
        while self._running.is_set():
            if self._reopen.is_set() or capture is None:
                self._reopen.clear()
                if capture is not None:
                    capture.release()
                with self._lock:
                    self._frame = None
                capture = self._open()
                if capture is None:
                    time.sleep(1.0)  # unplugged or busy: keep retrying quietly
                    continue
            ok, frame = capture.read()
            if not ok:
                capture.release()
                capture = None
                continue
            if self.mirror_horizontal:
                frame = cv2.flip(frame, 1)
            # A camera that opens but only sends black (lid shutter closed,
            # privacy switch on) is no use: move on to the next one, once
            # around, instead of leaving the app staring at nothing.
            if self._auto_select and float(frame[::16, ::16].mean()) < 4.0:
                black_since = black_since or time.monotonic()
                if time.monotonic() - black_since > 3.0 and tried < MAX_CAMERA_INDEX:
                    tried += 1
                    log.warning("Camera %d only sends black frames - trying camera %d.", self.index, self.index + 1)
                    self.index = (self.index + 1) % (MAX_CAMERA_INDEX + 1)
                    if self.index == self._exclude:
                        self.index = (self.index + 1) % (MAX_CAMERA_INDEX + 1)
                    self._reopen.set()
                    black_since = None
                    continue
            else:
                black_since = None
            with self._lock:
                self._frame = frame
                self._frame_at = time.monotonic()
        if capture is not None:
            capture.release()


class FridgeUI:
    def __init__(self, agent: voice.FridgeVoiceAgent, camera: Camera, vision=None, shelf_camera=None, auditor=None):
        self.agent = agent
        self.shelf_camera = shelf_camera  # second camera, pointed at the shelves (optional)
        self.auditor = auditor  # the inventory log and the recurring shelf check (optional)
        self._shelf_photo = None
        self._log_shown = None
        self.camera = camera
        self.vision = vision  # anything with an `.overlay` of (time, [(x1, y1, x2, y2, label)])
        self._events: queue.Queue[tuple[str, str]] = queue.Queue()
        self._photo = None  # keep a reference or Tk garbage-collects the image
        self._closing = False

        if sys.platform == "win32":
            # Without this Windows bitmap-stretches the window on a high-DPI
            # laptop screen and every caption comes out blurry.
            try:
                import ctypes

                ctypes.windll.shcore.SetProcessDpiAwareness(1)
            except Exception as exc:
                log.debug("Could not enable DPI awareness: %s", exc)

        self.root = tk.Tk()
        self.root.title("Nourish - Smart Food Bank Fridge")
        self.root.configure(bg=BG)
        dpi_scale = self.root.winfo_fpixels("1i") / 96.0
        self.root.geometry(f"{int((1280 if shelf_camera else 980) * dpi_scale)}x{int(860 * dpi_scale)}")
        self.root.minsize(int(640 * dpi_scale), int(560 * dpi_scale))

        header = tk.Frame(self.root, bg=BG)
        header.pack(fill="x", padx=20, pady=(14, 8))
        tk.Label(header, text="Nourish", font=(FONT, 22, "bold"), fg=ACCENT, bg=BG).pack(side="left")
        tk.Label(header, text="  Smart Food Bank Fridge", font=(FONT, 13), fg=MUTED, bg=BG).pack(
            side="left", pady=(8, 0)
        )
        self.status = tk.Label(header, text="Connecting...", font=(FONT, 12, "bold"), fg=WARN, bg=BG)
        self.status.pack(side="right")
        self.donation_status = tk.Label(header, text="", font=(FONT, 12, "bold"), fg=ACCENT, bg=BG)
        self.donation_status.pack(side="right", padx=(0, 18))

        # Result of the latest shelf audit (empty until an inventory camera is configured).
        self.inventory = tk.Label(self.root, text="", font=(FONT, 10), fg=MUTED, bg=BG, anchor="w", justify="left")
        self.inventory.pack(fill="x", padx=20, pady=(0, 6))
        self.inventory.bind("<Configure>", lambda event: self.inventory.configure(wraplength=max(200, event.width - 10)))

        self.sensor_status = tk.Label(self.root, text="Connecting sensors…", font=(FONT, 10), fg=MUTED, bg=BG, anchor="w", justify="left", wraplength=900)
        self.sensor_status.pack(fill="x", padx=20, pady=(0, 6))

        # The inventory log: what has been scanned in, and so what the shelf camera looks for.
        if auditor is not None:
            log_row = tk.Frame(self.root, bg=BG)
            log_row.pack(fill="x", padx=20, pady=(0, 6))
            for label, action in (("Check shelf now", self._check_shelf),):
                tk.Button(
                    log_row, text=label, font=(FONT, 9), bg=PANEL, fg=TEXT, activebackground=ACCENT, relief="flat",
                    padx=10, pady=2, command=action,
                ).pack(side="right", padx=(6, 0))
            self.log_label = tk.Label(log_row, text="", font=(FONT, 10), fg=TEXT, bg=BG, anchor="w", justify="left")
            self.log_label.pack(side="left", fill="x", expand=True)
            self.log_label.bind("<Configure>", lambda event: self.log_label.configure(wraplength=max(200, event.width - 10)))

        # Packed bottom-up first so the video is what shrinks when the window does.
        self.entry = tk.Entry(
            self.root, font=(FONT, 12), bg=PANEL, fg=TEXT, insertbackground=TEXT, relief="flat", highlightthickness=0
        )
        self.entry.pack(side="bottom", fill="x", padx=20, pady=(0, 16), ipady=7)
        self.entry.bind("<Return>", self._on_enter)
        tk.Label(
            self.root, text="Speak after Nourish finishes, or type here and press Enter   |   C = donor camera   |   V = shelf camera",
            font=(FONT, 9), fg=MUTED, bg=BG
        ).pack(side="bottom", anchor="w", padx=20, pady=(0, 3))

        captions = tk.Frame(self.root, bg=PANEL)
        captions.pack(side="bottom", fill="x", padx=20, pady=(10, 12))
        # Catalog photo of the scanned product (never a snapshot of the donor), with how it was verified.
        self.photo = tk.Label(captions, bg=PANEL, fg=MUTED, font=(FONT, 9), compound="top", justify="center")
        self.photo.pack(side="right", padx=(8, 16), pady=10)
        self._photo_image = None
        self._photo_stamp = None
        # Amber banner for an item that may not belong in the fridge. Hidden until needed.
        self.notice = tk.Label(
            captions, text="", font=(FONT, 12, "bold"), fg="#1f1500", bg=WARN, anchor="w", justify="left", padx=14, pady=8
        )
        self.product = tk.Label(captions, text="", font=(FONT, 11, "bold"), fg=ACCENT, bg=PANEL, anchor="w")
        self.product.pack(fill="x", padx=18, pady=(10, 0))
        self.agent_caption = tk.Label(
            captions, text="", font=(FONT, 19, "bold"), fg=TEXT, bg=PANEL, justify="left", anchor="w", height=3
        )
        self.agent_caption.pack(fill="x", padx=18, pady=(6, 4))
        self.user_caption = tk.Label(
            captions, text="", font=(FONT, 14), fg=MUTED, bg=PANEL, justify="left", anchor="w", height=2
        )
        self.user_caption.pack(fill="x", padx=18, pady=(0, 12))
        self.captions = captions
        captions.bind("<Configure>", self._on_resize)

        videos = tk.Frame(self.root, bg=BG)
        videos.pack(fill="both", expand=True, padx=20)
        videos.rowconfigure(1, weight=1)
        videos.columnconfigure(0, weight=1, uniform="cam")
        self.video_title = tk.Label(videos, text="", font=(FONT, 9, "bold"), fg=MUTED, bg=BG, anchor="w")
        self.video_title.grid(row=0, column=0, sticky="w")
        self.video = tk.Label(videos, bg="black", fg=MUTED, font=(FONT, 13))
        self.video.grid(row=1, column=0, sticky="nsew")
        if shelf_camera is not None:
            videos.columnconfigure(1, weight=1, uniform="cam")
            self.shelf_title = tk.Label(videos, text="", font=(FONT, 9, "bold"), fg=MUTED, bg=BG, anchor="w")
            self.shelf_title.grid(row=0, column=1, sticky="w", padx=(8, 0))
            self.shelf_video = tk.Label(videos, bg="black", fg=MUTED, font=(FONT, 13))
            self.shelf_video.grid(row=1, column=1, sticky="nsew", padx=(8, 0))

        self.root.bind("<Key-c>", self._cycle_camera)
        self.root.bind("<Key-C>", self._cycle_camera)
        self.root.bind("<Key-v>", self._cycle_shelf_camera)
        self.root.bind("<Key-V>", self._cycle_shelf_camera)
        self.root.protocol("WM_DELETE_WINDOW", self.close)

        agent.on_caption(lambda role, text: self._events.put((role, text)))  # background thread -> queue

    # -- main-thread loops ---------------------------------------------------
    def run(self) -> None:
        self.camera.start()
        if self.shelf_camera is not None:
            self.shelf_camera.start()
        self._agent_thread = threading.Thread(target=self.agent.run, name="voice-agent", daemon=True)
        self._agent_thread.start()
        self.root.after(VIDEO_INTERVAL_MS, self._tick_video)
        self.root.after(50, self._tick_events)
        self.root.mainloop()

    def close(self) -> None:
        if self._closing:
            return
        self._closing = True
        self.agent.stop()
        if self.auditor is not None:
            self.auditor.stop()
        self.camera.stop()
        if self.shelf_camera is not None:
            self.shelf_camera.stop()
        self._agent_thread.join(timeout=5.0)
        self.root.destroy()

    def _tick_video(self) -> None:
        if self._closing:
            return
        started = time.perf_counter()
        frame = self.camera.get_frame()
        width, height = self.video.winfo_width(), self.video.winfo_height()
        if frame is None:
            self._photo = None
            self.video.configure(image="", text=f"No picture from camera {self.camera.index}\n(press C to try the next one)")
        elif width > 10 and height > 10:
            self._draw_overlay(frame)
            scale = min(width / frame.shape[1], height / frame.shape[0])
            size = (max(1, int(frame.shape[1] * scale)), max(1, int(frame.shape[0] * scale)))
            rgb = cv2.cvtColor(cv2.resize(frame, size, interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
            self._photo = ImageTk.PhotoImage(Image.fromarray(rgb))
            self.video.configure(image=self._photo, text="")
        self.video_title.configure(text=f"DONOR CAMERA  (camera {self.camera.index})")
        self._tick_shelf_video()
        # Drawing a frame holds Python's GIL, and the audio callbacks need it
        # too. Capping the preview at ~15 fps (and never scheduling back to
        # back) keeps the picture from stealing time from the voice.
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        self.root.after(max(VIDEO_INTERVAL_MS - elapsed_ms, 20), self._tick_video)

    def _tick_shelf_video(self) -> None:
        if self.shelf_camera is None:
            return
        self.shelf_title.configure(text=f"SHELF CAMERA  (camera {self.shelf_camera.index})")
        frame = self.shelf_camera.get_frame()
        width, height = self.shelf_video.winfo_width(), self.shelf_video.winfo_height()
        if frame is None:
            self._shelf_photo = None
            self.shelf_video.configure(
                image="", text=f"No picture from camera {self.shelf_camera.index}\n(press V to try the next one)"
            )
        elif width > 10 and height > 10:
            scale = min(width / frame.shape[1], height / frame.shape[0])
            size = (max(1, int(frame.shape[1] * scale)), max(1, int(frame.shape[0] * scale)))
            rgb = cv2.cvtColor(cv2.resize(frame, size, interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
            self._shelf_photo = ImageTk.PhotoImage(Image.fromarray(rgb))
            self.shelf_video.configure(image=self._shelf_photo, text="")

    def _check_shelf(self) -> None:
        self.inventory.configure(text="Checking the shelf camera...", fg=MUTED)
        # Off the UI thread; the result comes back as an inventory event.
        threading.Thread(target=self.auditor.audit_now, name="shelf-check", daemon=True).start()

    def _clear_log(self) -> None:
        self.auditor.clear_expected()

    def _draw_overlay(self, frame: np.ndarray) -> None:
        """While a scan is running, box what the vision models are reading."""
        stamp, boxes = getattr(self.vision, "overlay", (0.0, []))
        if time.monotonic() - stamp > 0.8:
            return
        green = (128, 222, 74)  # BGR of ACCENT
        for x1, y1, x2, y2, label in boxes:
            cv2.rectangle(frame, (x1, y1), (x2, y2), green, 2)
            cv2.putText(frame, str(label)[:28], (x1, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, green, 2)

    def _show_photo(self, photo) -> None:
        self._photo_stamp = photo[0] if photo else None
        if photo is None:
            self._photo_image = None
            self.photo.configure(image="", text="")
            self._on_resize()
            return
        _stamp, image, caption = photo
        height = int(120 * self.root.winfo_fpixels("1i") / 96.0)
        size = (max(1, int(image.shape[1] * height / image.shape[0])), height)
        # Four channels = backdrop already cut out; Tk keeps the transparency.
        to_rgb = cv2.COLOR_BGRA2RGBA if image.shape[2] == 4 else cv2.COLOR_BGR2RGB
        rgb = cv2.cvtColor(cv2.resize(image, size, interpolation=cv2.INTER_AREA), to_rgb)
        self._photo_image = ImageTk.PhotoImage(Image.fromarray(rgb))
        verified = "NOT verified" not in caption
        self.photo.configure(image=self._photo_image, text=caption, fg=ACCENT if verified else WARN)
        self._on_resize()

    def _tick_events(self) -> None:
        if self._closing:
            return
        photo = getattr(self.vision, "product_photo", None)
        if (photo[0] if photo else None) != self._photo_stamp:
            self._show_photo(photo)
        if self.auditor is not None:
            items = ", ".join(f"{item['count']} x {item['name']}" for item in self.auditor.expected) or "empty"
            if items != self._log_shown:
                self._log_shown = items
                self.log_label.configure(text=f"Log (scanned in):  {items}")
        try:
            while True:
                self._show(*self._events.get_nowait())
        except queue.Empty:
            pass
        self.root.after(50, self._tick_events)

    def _show(self, role: str, text: str) -> None:
        if role == "session_reset":
            self.agent_caption.configure(text="Welcome! Tell me what you would like to donate.", fg=TEXT)
            self.user_caption.configure(text="")
            self.donation_status.configure(text="")
            self.product.configure(text="")
            self.notice.pack_forget()
            self.entry.delete(0, "end")
            self._show_photo(None)
        elif role == "agent":
            self.agent_caption.configure(text=text, fg=TEXT)
        elif role == "agent_cut_off":
            # Barge-in: show only what was actually spoken before the cut.
            self.agent_caption.configure(text=text, fg=MUTED)
        elif role == "user":
            self.user_caption.configure(text=f"You:  {text}")
        elif role == "notice":
            if text:
                self.notice.configure(text=f"CHECK THIS ITEM   {text}")
                self.notice.pack(fill="x", padx=18, pady=(12, 0), before=self.product)
            else:
                self.notice.pack_forget()
        elif role == "product":
            self.product.configure(text=text)
            if not text:  # donation logged: clear the photo with it
                if self.vision is not None:
                    self.vision.product_photo = None
                self._show_photo(None)
        elif role == "sensors":
            self.sensor_status.configure(text=text)
        elif role in ("inventory", "inventory_alert"):
            self.inventory.configure(text=text, fg=WARN if role == "inventory_alert" else MUTED)
        elif role == "donation":
            self.donation_status.configure(text=text)
        elif role == "status":
            self.status.configure(text=text, fg=ACCENT if text == "Live" else WARN)

    # -- input ---------------------------------------------------------------
    def _on_enter(self, _event) -> None:
        text = self.entry.get().strip()
        if text:
            self.entry.delete(0, "end")
            self.agent.say_as_user(text)

    def _cycle_camera(self, event) -> None:
        if event.widget is self.entry:
            return  # typing a "c" in the text box
        self.camera._exclude = self.shelf_camera.index if self.shelf_camera else None
        self.camera.switch((self.camera.index + 1) % (MAX_CAMERA_INDEX + 1))

    def _cycle_shelf_camera(self, event) -> None:
        if event.widget is self.entry or self.shelf_camera is None:
            return
        self.shelf_camera._exclude = self.camera.index  # one camera, one job
        self.shelf_camera.switch((self.shelf_camera.index + 1) % (MAX_CAMERA_INDEX + 1))

    def _on_resize(self, _event=None) -> None:
        # Leave room for the product photo, which sits to the right of the captions.
        self.root.update_idletasks()
        photo_width = self.photo.winfo_reqwidth() + 24 if self._photo_image is not None else 0
        wrap = max(200, self.captions.winfo_width() - 40 - photo_width)
        self.notice.configure(wraplength=wrap)
        self.agent_caption.configure(wraplength=wrap)
        self.user_caption.configure(wraplength=wrap)


def main() -> int:
    parser = argparse.ArgumentParser(description="Nourish demo window: webcam + captions")
    parser.add_argument("--camera", type=int, default=int(os.getenv("FRIDGE_CAMERA_INDEX", "0")), help="webcam index")
    parser.add_argument("--web", action="store_true", help="Serve the shared camera/voice bridge for the frontend")
    parser.add_argument("--text", action="store_true", help="text-only session: no mic, no speaker")
    parser.add_argument("--no-gemini", action="store_true", help="on-device vision only, never call Gemini")
    parser.add_argument(
        "--local-first", action="store_true",
        help="identify items with the on-device models first and Gemini as backup (default: Gemini first)",
    )
    parser.add_argument(
        "--inventory-camera",
        type=int,
        default=int(os.environ["FRIDGE_INVENTORY_CAMERA"]) if os.getenv("FRIDGE_INVENTORY_CAMERA") else None,
        help="index of a second camera pointed at the shelves: turns on the recurring inventory audit",
    )
    parser.add_argument(
        "--audit-interval",
        type=float,
        default=float(os.getenv("FRIDGE_AUDIT_INTERVAL", "300")),
        help="seconds between shelf audits (default 300; use e.g. 30 for a demo)",
    )
    parser.add_argument("--mic", default=os.getenv("FRIDGE_MIC_DEVICE", "Logitech"))
    parser.add_argument("--speaker", default=os.getenv("FRIDGE_SPEAKER_DEVICE", "JBL"))
    parser.add_argument("--echo-guard", choices=["gate", "mute", "off"], default=os.getenv("FRIDGE_ECHO_GUARD", "gate"))
    parser.add_argument(
        "--gate-rms", type=float, default=float(os.getenv("FRIDGE_GATE_RMS", voice.DEFAULT_GATE_RMS))
    )
    args = parser.parse_args()
    from fridge_camera_devices import named_camera
    args.camera = named_camera(os.getenv('FRIDGE_FRONT_CAMERA_NAME'), args.camera)
    args.inventory_camera = named_camera(os.getenv('FRIDGE_SHELF_CAMERA_NAME'), args.inventory_camera)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")

    api_key, agent_id = os.getenv("ELEVENLABS_API_KEY"), os.getenv("ELEVENLABS_AGENT_ID")
    if not api_key or not agent_id:
        log.error("ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID missing from %s.", voice.ENV_PATH)
        return 1

    agent = voice.FridgeVoiceAgent(
        ElevenLabs(api_key=api_key),
        agent_id,
        text_mode=args.text,
        input_device=None if args.text else voice.resolve_device(args.mic, "input"),
        output_device=None if args.text else voice.resolve_device(args.speaker, "output"),
        echo_guard=args.echo_guard,
        gate_rms=args.gate_rms,
    )
    data=FridgeData()
    data.start_audit_sync()
    placement = None
    def store_donation(record):
        evidence = placement.verify(record["items"], record["item_count"])
        products=record.get('products') or []
        details=products[-1] if products else {}
        details = {**details, 'placement_check': evidence, 'expiration': record.get('expiration'), **(record.get('storage_evidence') or {})}
        data.confirm_donation(record['items'],record['item_count'],details,operation_id=placement.operation_id)
        placement.complete()
    agent.set_donation_store(store_donation)
    camera = Camera(args.camera, auto_select=False, exclude=args.inventory_camera)
    # On-device models do the scanning, through the same frames the window
    # shows. Gemini double-checks them, and takes over for things they cannot make out.
    from fridge_local_vision import LocalVision

    backup = None
    if os.getenv("GEMINI_API_KEY") and not args.no_gemini:
        from fridge_vision import GeminiVision

        backup = GeminiVision(camera.get_frame)
    # Three checks on the live video: OCR + YOLO answer at once, and Gemini
    # re-examines the same frame in the background and tells Nourish if it disagrees.
    def track_product(details):
        agent.record_product(details)
        try: data.save_scan(details)
        except Exception: log.warning('Front scan could not be queued; check the data configuration.')
    vision = LocalVision(
        camera.get_frame,
        fallback=backup,
        on_second_opinion=agent.report_second_opinion,
        on_product=track_product,  # brand / size / category / catalog entry for each item
        prefer_gemini=not args.local_first,  # Gemini names products best; the local models back it up
    )
    vision.warm_up_async()  # load the models while Nourish is still saying hello
    agent.set_item_scanner(vision.identify_item)
    agent.set_expiry_scanner(vision.read_expiry)
    agent.set_barcode_scanner(vision.scan_barcode)
    from fridge_inventory import InventoryAuditor

    shelf_camera = auditor = None
    if args.inventory_camera is not None and args.inventory_camera == args.camera:
        log.error("--inventory-camera must be a different camera from --camera: shelf audits are off.")
    elif args.inventory_camera is not None:
        # Held open for a live preview; it never drifts onto the donor camera.
        shelf_camera = Camera(args.inventory_camera, auto_select=False, exclude=args.camera)
    if args.inventory_camera != args.camera:
        # The log (what was scanned in) is kept even with one camera; the
        # recurring check only runs when there is a shelf camera to look through.
        auditor = InventoryAuditor(
            args.inventory_camera if shelf_camera else args.camera,
            gemini=backup,
            interval_s=args.audit_interval,
            expected_provider=lambda: [{"name": r["canonical_name"], "count": int(r["recorded_quantity"])} for r in data.inventory() if int(r["recorded_quantity"]) > 0],
            # With one camera, "Check shelf now" looks at whatever the donor camera shows.
            capture=(shelf_camera or camera).get_frame,
        )
        agent.on_donation_logged(auditor.add_donation)  # what was scanned in = what should be on the shelves
    from fridge_placement import PlacementGate
    placement = PlacementGate(shelf_camera.get_frame if shelf_camera else None, backup)
    from fridge_placement import PickupGate
    pickup_gate = PickupGate(shelf_camera.get_frame if shelf_camera else None, backup)
    def authenticate_pickup(username, code):
        result = data.authenticate_pickup(username, code)
        pickup_gate.complete()
        pickup_gate.begin()
        placement.complete()
        return result
    def store_pickup(authorization, product, count):
        evidence = pickup_gate.verify(product['canonical_name'], count)
        result = data.complete_pickup(authorization['id'], product['product_id'], count, evidence)
        pickup_gate.complete()
        return result
    agent.set_pickup_handlers(authenticate_pickup, store_pickup)
    def scan_with_before_frame(hint: str = ""):
        placement.begin()
        return vision.identify_item(hint)
    def barcode_with_before_frame():
        try:
            placement.begin()
        except voice.PlacementPending as exc:
            return str(exc)
        return vision.scan_barcode()
    def reset_camera_session():
        placement.complete()
        pickup_gate.complete()
        vision.reset_session()
    agent.on_session_reset(reset_camera_session)
    agent.set_item_scanner(scan_with_before_frame)
    agent.set_barcode_scanner(barcode_with_before_frame)
    if args.web:
        from fridge_web import FridgeWebUI
        window = FridgeWebUI(agent, camera, vision, shelf_camera, auditor)
    else:
        window = FridgeUI(agent, camera, vision, shelf_camera, auditor)

    if auditor is not None:

        def on_audit(report: dict) -> None:
            stamp = report["time"][11:16]
            alert = report["status"] == "discrepancy"
            window._events.put(("inventory_alert" if alert else "inventory", f"Shelf check {stamp}:  {report['headline']}"))
            try:data.save_audit(report)
            except Exception as exc:window._events.put(('inventory_alert',f'Audit was not saved: {exc}'))
            if report["status"] in ("ok", "discrepancy"):
                # Nourish learns what is inside (and about a spill) as silent context.
                inside = ", ".join(f"{item['count']} x {item['name']}" for item in report.get("observed_items", report["expected_now"])) or "nothing"
                spill = f" There is a spill or mess inside: {report['spill']}." if report["spill"] else ""
                agent.update_inventory(f"Shelf camera at {stamp}: {report['summary'] or inside} Counted: {inside}.{spill}")

        auditor._on_report = on_audit
        if shelf_camera is not None:
            auditor.start()  # first check now, then every --audit-interval seconds
        if backup is None:
            log.warning("Shelf audits need Gemini to recognise what is on the shelves; without it they only detect changes.")
    sensor_stop=threading.Event()
    def poll_conditions():
        previous=set()
        last_context = 0.0
        while not sensor_stop.is_set():
            try:
                conditions=data.conditions()
                summary=condition_summary(conditions)
                if time.monotonic() - last_context >= 15:
                    agent.update_conditions(summary)
                    last_context = time.monotonic()
                window._events.put(('sensors',summary))
                active={item['key'] for item in conditions['alerts']}
                for item in conditions['alerts']:
                    if item['key'] not in previous and placement.before is None:agent.announce(f"{item['label']}: please check the fridge. This is a monitoring alert, not a food safety diagnosis.")
                previous=active
            except Exception:
                agent.update_conditions('Sensor monitoring is unavailable; do not infer normal or safe conditions.')
                window._events.put(('sensors','Sensor data unavailable. Check the data API and Arduino.'))
            sensor_stop.wait(2)
    threading.Thread(target=poll_conditions,daemon=True,name='voice-sensor-monitor').start()
    try:window.run()
    finally:sensor_stop.set()
    return 0


if __name__ == "__main__":
    load_dotenv(voice.ENV_PATH)
    sys.exit(main())
