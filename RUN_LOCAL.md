# Local hardware and vision integration

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
