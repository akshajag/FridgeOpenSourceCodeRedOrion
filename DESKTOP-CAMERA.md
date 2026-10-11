# Nourish desktop camera station

Double-click **Nourish.app** in this folder. It opens a native Mac window, not a Vercel page or browser kiosk. Keep the app in this folder: its launcher uses the project’s private configuration and Python environment.

- Both cameras, barcode reading, Gemini identification, expiration prompts, ElevenLabs voice and recurring shelf checks run on this Mac.
- Click **Check shelf now** for a manual audit; scheduled shelf audits still run every 30 seconds.
- Click **Finish / next donor** to end the conversation and reset for the next visitor.
- Close the window to stop the camera software. Double-click the app again to reopen it. A duplicate-launch guard prevents two desktop instances competing for cameras.
- Gemini, ElevenLabs and Tiger Data still require internet access. The Vercel dashboard stays available; camera previews and controls no longer depend on the Vercel camera page or its tunnel.
- Missing Logitech camera: the app opens with the front camera; shelf audits and placement verification are unavailable. Reconnect Logitech and restart the app to enable them.
- If it fails to open, use **Launch Voice.command** to see startup errors. The app log is `runtime/desktop-camera.log`.
- Existing hosted camera page is retained, but cannot reach a desktop camera process because the native app does not expose camera HTTP endpoints.

Runtime dependencies are installed on the demo Mac; credentials remain in ignored `.env` files and are not part of GitHub.
