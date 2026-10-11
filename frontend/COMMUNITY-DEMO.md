# Nourish community map and Google login

## Preview

- Paired operator: `/dashboard/operator/community` and `/dashboard/operator/leaderboard`.
- Google donors: `/sign-in` → `/dashboard/donor` (the community map), with `/dashboard/donor/leaderboard` for standings.
- Existing temperature, air, moisture and movement charts remain real Tiger Data measurements.

## Community demonstration

12 fictional Houston fridge sites and four crews populate the map. Positions and neighborhood rectangles are illustrative, not real service locations or official boundaries. Initial stocks and crew contributions are mock data.

Select a fridge, choose a demo crew, enter a quantity, and choose **Simulate confirmed refill**. The server increases stock, records a demo contribution and assigns the neighborhood to the crew with the largest supplied quantity. Standings rank food units supplied, then number of fridges helped. No scanning points or Solana transaction is involved. Everyone can help a fridge regardless of its territory holder.

Records are shared between accounts/devices using this local server and persist in the ignored `runtime/community-demo.json`. They are **not** inserted into Tiger Data's actual inventory or sensor history. This file-backed demo expects one Node server; it is not a distributed production persistence layer. Real donated quantities are heterogeneous and must be standardized before comparing impact in production. The week shown is a fixed demo scenario, not an implemented recurring weekly reset.

## Authentication

Clerk development credentials have been configured privately on this Mac; Google OAuth is enabled using Clerk's shared development credentials. New users get donor access. Operator access to the real fridge requires a valid paired-device session or an explicitly assigned membership for that fridge; users cannot self-assign that membership through onboarding in hardware mode.

Use Chrome for Google login. Google does not support OAuth inside embedded browser webviews. Sign out through the account menu to switch Google users. Authentication settings/keys are ignored by Git. Teammates need the same Clerk development application's publishable and secret keys through a private channel, not committed to the repo.

The Clerk development application was provisioned accountlessly. To own/manage it permanently, run `npx clerk auth login` from `frontend/` and finish the Clerk login/claim in your browser. Keep `.clerk/keyless.json` private. Production requires claiming the app, production Clerk credentials, a registered domain and Google's OAuth credentials configured in Clerk. Development Google sign-in is not production deployment readiness.

## Resources reviewed

- Paper.io open-source clone: https://github.com/Ludecat/paper.io (MIT). Reviewed as territory-game inspiration; no game code, branding or assets copied.
- Existing MapLibre GL renders original neighborhood rectangles over OpenFreeMap/OpenStreetMap basemaps. Map/data attribution remains visible.
- Clerk Google setup: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google

## Checks

`node --experimental-strip-types --test src/lib/community/model.test.mjs` verifies territory transfer, idempotent retries, invalid refills, capacity limits and deterministic ties.
