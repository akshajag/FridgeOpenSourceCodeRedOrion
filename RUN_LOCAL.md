# Integrated fridge MVP: two screens

Keep the project outside iCloud (for example `~/Hackathon/FridgeMVP`). Double-click `Launch MVP.command`, or run:

```sh
.venv/bin/python run_fridge.py --mvp
```

On the fridge Mac open http://127.0.0.1:3001/kiosk . On the other device, use `http://<fridge-Mac-Wi-Fi-IP>:3001/dashboard/operator`. Both devices must be on the same Wi-Fi. They are two routes of the same app and share Tiger Data; you do not need to copy the database or attach hardware to the dashboard device.

The cameras, microphone and speaker belong to the fridge Mac. Keep that Mac awake with Arduino and both cameras attached. Remote browsers show the screens; voice still uses the fridge Mac's audio devices.

For a new Wi-Fi address, update `FRIDGE_ALLOWED_HOSTS` privately in `frontend/.env.local` and restart. Both devices will ask once for `FRIDGE_DEVICE_PAIR_CODE` from that file. Its signed HttpOnly device cookie lasts eight hours. Device pairing is separate from donor authentication. The Python camera and data APIs stay on loopback; the frontend passes their private token on the server.

The launcher uses an available `.next-check` production build for a steady demo. For frontend editing with automatic updates, run `run_fridge.py --mvp --dev`; rebuild the production version with `NEXT_DIST_DIR=.next-check npm run build --prefix frontend -- --webpack` while the development server is stopped.

The kiosk streams camera previews continuously at up to 15 fps with reduced preview resolution. Recognition uses the original camera frames. Set `FRIDGE_FRONT_MIRROR=1` in root `.env` to correct a horizontally reversed camera source; use `0` for an already-correct source. Shelf mirroring can be configured separately with `FRIDGE_SHELF_MIRROR`.

The dashboard reads current sensor conditions and actual inventory from the existing Tiger Data API every two seconds. Hardware alert messages clear when measured conditions recover. Manual dashboard mutations are disabled in hardware mode; verified donations are recorded through the kiosk.

Clerk has not been configured for this local MVP. Donations are guests, not verified donor identities. Between donors, voice/session state, pending products, captions and donor cookies reset; recorded inventory remains. With Clerk configured, the kiosk also signs out the prior donor. Each donor starts with Begin donation, talks through identification and placement, then says “I'm finished” or uses Finish / next donor.

Installation on a new machine: create a Python 3.12 virtual environment, install `requirements.txt`, run `npm ci` in `frontend` and `tiger-data`, and configure each `.env.example` privately. For the integrated app, set `FRIDGE_HARDWARE_MODE=1`, `NEXT_PUBLIC_FRIDGE_HARDWARE_MODE=1`, `FRIDGE_ID`, `FRIDGE_DATA_TOKEN` (matching the local data API), allowed hosts, a device pairing code, and a random signing key in `frontend/.env.local`. Configure Gemini/ElevenLabs and camera indices in root `.env`; configure Tiger credentials and serial port in `tiger-data/.env`. Never commit these files.

Validation: `python -m unittest discover -s tests`, `node --test frontend/tests/device.test.mjs`, and the frontend build/lint commands. See the remaining diagnostics below for hardware details.

# Diagnostic hardware and vision integration

Run from this repository in Cursor:

```sh
.venv/bin/python run_fridge.py
```

This opens the diagnostic camera window and starts/reuses the local Tiger Data API and Arduino uploader. Leave Arduino Serial Monitor closed. Keep the Mac awake and the USB cable connected.

For the voice-enabled camera window, close the diagnostic window first, then run:

```sh
.venv/bin/python run_fridge.py --voice
```

Private root `.env` holds Gemini and ElevenLabs keys and the voice agent ID; `tiger-data/.env` holds database credentials and the local API token. Copy `.env.example` for new machines; transfer credentials privately. Never commit them. Dependencies: `python -m pip install -r requirements.txt` in a Python 3.12 virtual environment, and `npm ci` in `tiger-data`.

## Test flow

1. Sensor status should show fresh readings. Detailed graphs: http://127.0.0.1:3200/monitor .
2. Show food to the donor camera; use Scan item. Gemini identifies food, with local OCR/detector fallback. Use Barcode/catalog when exact identity is uncertain.
3. Review identity and quantity; only confirm a donation after actually putting it inside. Confirmation writes product metadata and an idempotent donation event to Tiger Data.
4. Shelf audits compare the Logitech view with recorded inventory. Audit observations are saved separately; camera uncertainty never silently changes recorded stock. Snapshots remain local in `audits/`; the database stores audit JSON and catalog image URLs, not image binary data.
5. In voice mode, ElevenLabs tools invoke the same item/barcode/expiry scanners, record confirmed donations, and receive sensor context and new-alert announcements. Its configured agent needs the tool names defined in `fridge_voice_agent.py`; keys alone do not configure a remote agent.

Camera defaults: donor 0, shelf 1. Change `.env` camera indices if reversed. Local YOLO classes are limited; Gemini provides broader recognition. An expiry reading is an unverified observation. Moisture is contact wetness, not humidity; air quality is a relative raw signal, not spoilage identification. Accelerometer alert uses movement above 0.20g and cannot prove theft. Monitoring coverage is not a food safety probability.

The launcher stops only services it starts when its window closes. If you already started the uploader separately, keep that terminal running. Existing sensor firmware and wiring are documented under `hardware/`; database routes and setup are under `tiger-data/`.

## Talk-through donation and restarting

`run_fridge.py` is the entry point. `fridge_ui.py` is the voice/camera window; `fridge_voice_agent.py` defines the conversation and client tools; `fridge_placement.py` gates recording on an inside-camera comparison.

Voice flow: say you are donating, show one product to the Mac camera, answer identity/quantity/date questions, place it on a visible fridge shelf, and say “I've put it inside.” Nourish compares the Logitech frame with a baseline captured BEFORE the initial scan. It only records a newly visible matching product, with the expected quantity, placed inside. Failed/unclear checks keep the same baseline and donation ID for a retry; inventory changes only after the donation is saved. Donate different products one at a time. This is visual evidence, not identity authentication or proof of safety. Keep the Logitech camera fixed, pointing inside with the label visible and enough light. A picture of food held outside the fridge fails the placement check.

To restart: close the app window using its close button (or press Ctrl+C in the terminal that launched it). Run `.venv/bin/python run_fridge.py --voice` again from this folder. Wait until the previous window closes; only one camera app should run. Restarting does NOT clear inventory or historical data.

To change the speaking voice: ElevenLabs → Agents → Smart Food Bank Fridge - Nourish → Voice & Language, choose/preview a voice, then save/publish if shown. Restart the local voice app for a new conversation to use it. The normal launcher preserves dashboard voice choices. Avoid `--configure-agent` unless you intend to reapply the repository's complete default agent configuration.

## Date scans and audio

The date scanner tries local OCR, then Gemini on fresh camera frames if OCR cannot read a date. The voice guide asks for a steady, well-lit view of the printed date and retries once before asking the donor to read it aloud. Never treat an unreadable date as a verified expiry.

The donation flow has no points, rewards, or leaderboard. Audio uses matching 16 kHz PCM formats, a 200 ms playback buffer, and limited OCR worker threads to reduce interruptions. The selected ElevenLabs voice is `mUMf6FnFQ187d2RrRzft`. If changing speakers, select the audio device before launching a new conversation.
