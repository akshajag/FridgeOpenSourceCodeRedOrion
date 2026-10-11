# Tiger Data dashboard integration

The original team frontend comes from `orion/frontend` (191d8ee). Its landing page, tour, navigation, overview, inventory and scanner layout are retained. There is no browser camera/voice kiosk in this frontend. The donation device is owned separately by the camera team.

## Run
Double-click **Launch Data Dashboard.command**, or run `.venv/bin/python run_fridge.py --data-only` from this repository. It starts the private Tiger API, reuses an existing serial reader, and opens a server on port 3001. Keep Serial Monitor closed. Existing processes are reused. Stop with Ctrl+C; this stops only processes that this launcher started.

- Original website: http://localhost:3001/
- Live operator dashboard: http://localhost:3001/dashboard/operator
- Sensor monitoring: http://localhost:3001/dashboard/operator/monitoring

For another device on the same Wi-Fi, replace localhost with the sensor Mac IP. The device access code in private `frontend/.env.local` grants an eight-hour operator session; it is separate from donor authentication. Clerk account setup remains pending. Demo personas still use the teammate's sample dataset; the paired operator session uses actual Tiger records.

## Data flow
Arduino USB → serial-bridge.js → Tiger PostgreSQL sensor hypertable → private localhost:3200 API → server-side Next.js adapter → original dashboard (refreshes every 2 seconds).

The adapter reads real temperature, raw air response, contact wetness, acceleration peak, alert conditions, inventory balance, donation proposals and inventory history. Charts merge recent exact readings with five-minute temperature/air averages and moisture/movement maxima over seven days, preserving brief wetness and motion peaks. Older averages are trend data, not raw samples. Nothing clears or rewrites recorded sensor data.

Missing expiry stays unknown. The category defaults to Pantry when not supplied; it is not an AI classification. Location is approximate CodeRED venue metadata, not GPS. Camera/voice connection status is unavailable on this sensor device. Contact wetness is not relative humidity; air response is not ppm. Coverage is data availability, not food-safety probability. Inventory balances may aggregate donations with different expiry dates; a displayed expiry is the latest recorded donation metadata, not a guarantee for all units.

## Separate donation device
Use the existing authenticated Tiger API product/proposal/confirmation endpoints described in `tiger-data/README.md`. Store `category`, `unit`, and ISO `expires_at` in proposal details when known. Only confirmation creates an inventory event; the dashboard then picks it up automatically. Database/API credentials stay server-side and out of Git. Do not expose port 3200 to the network.

Live hardware mode is a read-only dashboard: sensor alerts clear when measurements recover and inventory changes come from the donation device. The original manual editor, scanner and other role screens remain in the frontend source, but full Clerk-backed workflows, missions, rewards and organization connections are not connected to this hardware adapter. They must not be presented as live implemented features.
