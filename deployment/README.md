# Nourish hosted dashboard and camera station

Two independent Vercel projects use the same hardware/data backend:
- `nourish-dashboard-orion`: original Next.js dashboard (`frontend/`).
- `nourish-camera-orion`: separate camera and voice control screen (`camera-portal/`).

The Python camera/voice engine and Arduino reader still run on the fridge Mac. Vercel cannot directly open its USB hardware. The camera screen uses authenticated WebSocket JPEG preview streams captured by that Mac (640 pixels wide, targeting 30 frames per second); microphone input and speaker audio remain on the Mac. The screen can start/end a conversation, send a typed reply and request a shelf check.

Run `.venv/bin/python run_fridge.py --voice --web` from the repository root. It starts the local Tiger API and camera bridge. The original native camera window must be closed first to avoid opening webcams twice.

The separately started `deployment/hardware-gateway.mjs` accepts only the saved backend bearer token, then forwards `/data/*` to localhost:3200 and `/camera/*` to localhost:3201. It never exposes the localhost monitor. A Cloudflare tunnel connects to localhost:3210; raw services are not tunneled. This requires the explicit tunnel approval obtained during setup.

Vercel server-only settings:
- Both projects: `FRIDGE_DATA_TOKEN`, `FRIDGE_DATA_BASE_URL`, `FRIDGE_CAMERA_BASE_URL`, `FRIDGE_DEVICE_KEY`, `FRIDGE_DEVICE_PAIR_CODE`, `FRIDGE_ID`.
- Dashboard: Clerk publishable/secret keys, `FRIDGE_HARDWARE_MODE=1`, `FRIDGE_ALLOWED_HOSTS` containing its production hostname.

The camera page requires the private device pairing code and sets an eight-hour HttpOnly, Secure, SameSite cookie. Credentials never belong in source code or browser scripts. The dashboard keeps real user login and server authorization; demo personas cannot fetch live inventory. Pairing a fridge dashboard is separate from identifying a volunteer for mission points.

Every 30 seconds the fixed Logitech camera captures a fresh shelf frame, Gemini analyzes it and the audit is stored in Tiger Data. A slow request delays the next scan; calls never overlap. Provider failures remain unavailable records. The website polls stored results every five seconds and labels last successful observations after failed checks. Camera observations do not automatically erase confirmed donation records.

A quick Cloudflare tunnel URL changes when that tunnel is restarted. Update both Vercel base URLs and redeploy after such a restart. Keep the Mac awake, Arduino connected and gateway/tunnel running throughout the demo; hosted hardware features become unavailable when the Mac is offline. This is a demo connection, not an unattended production deployment.

Preview video bypasses the Vercel function body and goes through an encrypted WebSocket on the existing authenticated tunnel. Vercel issues paired viewers camera-specific HMAC tickets lasting 90 seconds; the gateway rejects expired, altered, or wrong-camera tickets and requires the camera site's Origin. The private signing key and data API token are never sent to the browser. Video sends only new camera frames and drops frames under backpressure instead of queuing a delay. Tickets renew automatically, and previews pause in hidden tabs. The page shows measured rendering FPS.

Gateway setup: `npm ci --prefix deployment`, then `node --env-file=tiger-data/.env --env-file=frontend/.env.local deployment/hardware-gateway.mjs` from the repo root. The second private environment file supplies the existing `FRIDGE_DEVICE_KEY` used to validate camera tickets. Keep the existing tunnel pointed at localhost:3210.

Recognition, barcode/date reading and shelf audits still use full-resolution camera frames; preview compression does not change those inputs. Tests: `node --test deployment/tests/preview-auth.test.mjs camera-portal/tests/bridge.test.js`.
