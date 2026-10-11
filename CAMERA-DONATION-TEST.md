# Camera donation test

Run `.venv/bin/python run_fridge.py --voice` from the repository root. Close the existing camera window before restarting. Keep the sensor uploader running; do not open Arduino Serial Monitor.

On this Mac, `.env` binds the donor camera to **FaceTime HD Camera** and the shelf camera to **Brio 101**, resolving their current indices at launch. A missing named camera blocks startup instead of silently substituting another camera.

1. Check the two previews: donor camera faces the person; shelf camera looks inside the fridge. Press C/V only if the assigned camera is wrong. Keep the shelf camera fixed throughout a donation.
2. Keep the new item outside while scanning it. The first scan captures the shelf before placement. Retrying identification keeps that original frame.
3. Nourish offers speaking the date or showing its label. For spoken dates, give month, day and year, then confirm the read-back. The date is stored as donor-reported, never camera-verified. Ambiguous dates require clarification.
4. Put the item on a visible shelf, keep its label toward the inside camera and move your hand away. Say it is inside. The app compares before/after frames and saves only if a new matching quantity is visible.
5. If the check is pending, leave the item visible and ask to retry the inside check. Do not start a new donation or rescan the front camera. A dark/occluded image or unavailable Gemini service does not prove placement.
6. After success, donate another item or finish the session; the next donor starts with fresh evidence/date state.

The Mac microphone is selected explicitly on this device. Echo protection pauses listening during Nourish playback and for 350 ms afterward; speak once it finishes, or use the typed input. Patient voice turn-taking leaves more room for reading dates. Sensor display still refreshes; contextual updates are throttled and spoken alerts are suppressed during an active donation.

Shelf audits run every five minutes or via **Check shelf now**. Both webcams remain open. Camera frames older than two seconds are rejected. Gemini has two bounded model attempts, including a fallback after a timeout; a provider outage remains an explicit pending/error state, never fabricated inventory.
