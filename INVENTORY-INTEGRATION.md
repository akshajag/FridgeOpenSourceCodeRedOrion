# Nourish inventory: camera → Tiger Data → dashboard

The front camera identifies an item with the existing Gemini/barcode/catalog flow. Each identification is stored in `fridge.item_scans`; it does **not** add stock. Once the donation workflow confirms placement, it writes the product and one donation event. Product image URLs, source URLs, brand, package size and identification metadata travel with the product.

The rear camera audits immediately, then every 300 seconds by default, while the two-camera Python app is running. Each check is saved, including unavailable/unclear checks. Successful checks compare visible counts to recorded stock. They never silently erase stock when a package is hidden. A small JPEG shelf thumbnail is saved in Tiger Data when available; original snapshots stay in the camera device's private `audits/` directory.

Front scans and shelf reports use an ignored, persistent `runtime/vision-outbox/` queue. The background worker retries every five seconds. IDs make repeated uploads safe. Confirmed donations use stable operation/product IDs and the existing confirmation transaction to avoid double counting. Pending donations still require completion of the donation workflow; they are not automatically confirmed by this queue.

## Camera teammate: run on your device

1. Pull the latest `main` from this repository. Use the existing Python environment/setup in the project README.
2. Privately configure root `.env` for Gemini/ElevenLabs and `tiger-data/.env` for the **same Tiger Cloud database**, your restricted database connection and local `DATA_API_TOKEN`. Never commit these files. Update the database URL's certificate path for your copy of `tiger-data/tiger-ca.crt`.
3. Keep `FRIDGE_ID=orion-fridge-01` for this demo's physical fridge. Additional fridges need registered IDs before uploads.
4. Run `npm ci --prefix tiger-data`, then from `tiger-data` run `npm start`. It serves only `127.0.0.1:3200`. If already running, restart it to load the new scan/catalog endpoints.
5. Restart the Python two-camera app (`python run_fridge.py --voice` with your existing camera arguments), or the project's test bench. Enable/select a separate rear shelf camera; the test bench also starts scheduled checks when that camera is supplied. Existing `--audit-interval` can change the voice app's interval.
6. Complete one real donation. Check that the front scan appears, the recorded quantity increments once after placement confirmation, and the next shelf audit appears. Failed database uploads remain queued locally for retry.

Each machine can run its own localhost API connected to the same Tiger Cloud database. The website reads the shared database through its server's local API. Do not point the Python client at an insecure LAN URL: it intentionally permits only a localhost API. No remote ingestion gateway was added.

## Website

Signed-in users can open `/dashboard/donor/inventory`, `/dashboard/operator/inventory` or `/dashboard/food-bank/inventory`. The real-fridge selector uses Tiger Data's registered fridges, independently of fictional community-map sites. The page refreshes every five seconds and shows product cards, recorded stock, camera-observed counts, scan history and image provenance. Raw shelf thumbnails are restricted to that fridge's authenticated operator; donors receive product catalog pictures, not private camera snapshots.

A missing image shows “Product image pending.” Gemini identification alone does not guarantee an exact catalog picture: existing barcode/catalog lookup and visual matching provide the image URL. The dashboard distinguishes barcode matches, visual matches and catalog suggestions. Unreadable/ambiguous expiration dates remain unknown. Counts from an older usable audit retain their analysis timestamp when a newer check fails.

## Verification

`npm run verify` from `tiger-data` checks real database writes and reads inside a rollback transaction: scan deduplication, product image/metadata storage, donation deduplication and preservation of stock on unusable shelf checks. Python unit tests cover the persistent scan/audit retry queue and catalog matching. Frontend normalization tests cover stock preservation, unknown counts, safe URLs and operator-only thumbnails.

A final physical camera donation on the teammate's device is still required after pulling/restarting; database tests do not substitute for that device check. No fake inventory is inserted by verification.
