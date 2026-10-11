# Nourish community map and Google login

## Preview

- Paired operator: `/dashboard/operator/community` and `/dashboard/operator/leaderboard`.
- Google donors: `/sign-in` → `/dashboard/donor` (personal overview), `/dashboard/donor/missions` (joinable refill missions), `/dashboard/donor/find` (street map), with `/dashboard/donor/leaderboard` for standings.
- Existing temperature, air, moisture and movement charts remain real Tiger Data measurements.

## Community demonstration

12 fictional Houston fridge sites, four fictional crews, and seeded volunteer refill history populate a **CodeRED: Orion** community demonstration. MLH is presented as sponsor/community context, not as an assertion that actual MLH volunteers made donations. Stocks and location markers are mock data; roads are real OpenStreetMap streets delivered by OpenFreeMap.

Overview contains the signed-in user's own contributions, active missions, suggested priority refills, and links to the map. Missions supports All / Priority / My missions, joining and leaving, and a 32-unit collective stock goal. Membership is keyed to the authenticated server-side account ID, not a name or an ID submitted by the browser. A simulated refill contributes to the shared stock goal; reaching 32 units moves the joined mission into Completed together. New accounts start at zero personal contributions instead of inventing their history.

## Territory rules

The Paper.io-inspired territory overlay uses a bounded, shared lattice over Houston. Each crew starts at one fixed home base: Midtown, Third Ward, East End, or University. Its initial budget is 12 cells plus three cells per supplied food unit. A deterministic multi-source frontier expansion claims only adjacent, unoccupied cells, so every crew's footprint stays connected and no cell is assigned twice. External borders and crew labels distinguish the regions; subtle interior grid lines show the cells. This is a refill-driven territory game, not the original Paper.io movement/trail-survival game. Territory is symbolic, not an official neighborhood boundary or exclusive access to food.

Select a fridge, choose a demo crew, enter a quantity, and choose **Simulate confirmed refill**. Stock, personal history, mission progress, the territory footprint and standings update together. Capacity validation prevents donating more units than the fridge can accept. Standings rank food units supplied, then number of fridges helped; the Map cells column is counted from the exact grid rendered on the map. The leading contributor at an individual fridge is separate from the crew's global home-base territory. No scanning points or Solana transaction is involved. All locations remain open to every crew.

Records are shared between accounts/devices using this local server and persist in the ignored `runtime/community-demo.json`. They are **not** inserted into Tiger Data's actual inventory or sensor history. This file-backed demo expects one Node server; it is not a distributed production persistence layer. Real donated quantities are heterogeneous and must be standardized before comparing impact in production. The week shown is a fixed demo scenario, not an implemented recurring weekly reset.

## Authentication

Clerk development credentials have been configured privately on this Mac; Google OAuth is enabled using Clerk's shared development credentials. New users get donor access. Operator access to the real fridge requires a valid paired-device session or an explicitly assigned membership for that fridge; users cannot self-assign that membership through onboarding in hardware mode.

Use Chrome for Google login. Google does not support OAuth inside embedded browser webviews. Sign out through the account menu to switch Google users. Authentication settings/keys are ignored by Git. Teammates need the same Clerk development application's publishable and secret keys through a private channel, not committed to the repo.

The Clerk development application was provisioned accountlessly. To own/manage it permanently, run `npx clerk auth login` from `frontend/` and finish the Clerk login/claim in your browser. Keep `.clerk/keyless.json` private. Production requires claiming the app, production Clerk credentials, a registered domain and Google's OAuth credentials configured in Clerk. Development Google sign-in is not production deployment readiness.

## Resources reviewed

- Paper.io open-source clone: https://github.com/Ludecat/paper.io (MIT). Reviewed as territory-game inspiration; no game code, branding or assets copied.
- MapLibre GL renders connected territory cells, external borders and crew labels over OpenFreeMap/OpenStreetMap basemaps. Map/data attribution remains visible.
- Clerk Google setup: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google

## Checks

`node --experimental-strip-types --test src/lib/community/model.test.mjs` verifies contribution ranking, idempotent retries, invalid refills, capacity limits, deterministic ties, territory connectivity/non-overlap/growth, account-isolated mission membership and completion.
