# Managed-fridge donation and pickup flow

Run `.venv/bin/python run_fridge.py --voice` from the repository root. The website is at http://localhost:3001/dashboard/donor/missions. Close the existing camera window before restarting; never run two camera instances. Private credentials stay in ignored environment files.

## Identification and dates

Barcode scanning uses ZXing locally on fresh camera frames, including mirrored barcodes. It does not call Gemini or load OCR. Open Food Facts supplies product metadata/images when the barcode is in its catalog; an unknown code remains a decoded code and the user is asked for the product name. Network catalog lookup can take longer than decoding.

Expiration-label OCR tries normal and mirrored text. The bounded Gemini date fallback receives an unmirrored image. The camera preview remains unchanged. A user may read the date aloud and confirm its read-back; donor-reported dates are stored separately from camera observations. Unreadable or ambiguous dates require clarification.

Dry pantry snacks (including Doritos), open packaging, and freezer-only products are rejected for this refrigerator. Unknown storage requirements require a confirmed label instruction or operator review. Both the voice tools and donation save path enforce this rule.

## Authorized collection

1. Sign in with your own account on the website and open Missions.
2. Use **Start transfer / get pickup code**. This creates a chilled-food transfer pickup assignment for a volunteer; an organization-authorized food-bank employee records a collection without points.
3. Tell Nourish you are collecting, then give the displayed username and temporary six-digit code. Codes expire after ten minutes. Saying a username or claiming to be an employee alone grants no access.
4. Authenticate before removing food, so the fixed inside camera can capture the original shelf. Choose the inventory product and quantity. Remove it, move your hand away, then explicitly confirm removal.
5. The inside camera must verify the matching quantity was removed. An uncertain, hidden or unavailable image leaves the collection pending. Retry the shelf check without restarting the session.
6. A verified volunteer pickup awards **10 mission pickup points once**, reduces inventory, and appears in the live mission pickup leaderboard. The session clears its identity after success/end for the next person.

Pickup points do not certify completed delivery and do not transfer SOL. Receiving-site verification remains separate. Fictional rescue mission cards remain demo data and cannot award real pickup points. Automatic shelf audits record observations and discrepancies; they do not authorize collections or award points.

Tiger migration `004_pickups.sql` stores authorization, mission identity, camera evidence and the points ledger. Frontend `/api/pickups` derives identity and employee membership from Clerk; the private Tiger API is called only server-side. Completed operations are idempotent: a retry cannot double-award points or remove stock twice. Camera evidence is an AI observation, not a calibrated guarantee against theft.
