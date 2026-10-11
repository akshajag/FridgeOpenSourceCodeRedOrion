# Nourish

**A smarter fridge for a more connected community.**

Nourish is an AI-powered community food-sharing platform connected to smart refrigerators. Food banks coordinate a network of community fridges, operators monitor the fridge they host, and donors bring food where it is needed and see it verified.

This repository is the web application: a cinematic 3D product tour, authentication and role onboarding, and three role-specific dashboards, all usable in a fully labeled **demo mode** without any API keys.

## Local setup

Requirements: **Node.js 20.9 or newer** and npm (both come from https://nodejs.org). Nothing else is needed for demo mode. Blender is only required if you want to re-export the 3D assets (see [3D tour and Blender assets](#3d-tour-and-blender-assets)); the exported models are already in `public/models`.

```bash
git clone https://github.com/akshajag/FridgeOpenSourceCodeRedOrion.git
cd FridgeOpenSourceCodeRedOrion/frontend
npm install        # also copies MapLibre's web worker into public/maplibre (postinstall)
npm run dev
```

The web app lives in the `frontend/` folder of the team repository; the Python hardware, voice and camera services are at the repository root and are set up separately (see the root `README.md` and `RUN_LOCAL.md`).

Open http://localhost:3000. The first page load compiles on the fly, so give it a few seconds; the 3D tour then shows a short loading screen while it downloads about 4 MB of models and textures (cached after the first visit).

To check that everything is wired up before a demo:

```bash
npx tsc --noEmit   # type-check
npm run lint       # eslint
npm run build      # production build, same as Vercel runs
npm run start      # serve the production build on http://localhost:3000
```

If port 3000 is busy, run `npm run dev -- -p 3001`. If the dev server ever starts reloading the page in a loop after many rapid edits, stop it, delete `.next/dev`, and start it again.

With no environment variables set, the app runs in demo mode:

1. The landing page shows the 3D fridge tour (scroll, or press **Play tour**).
2. **Open demo** → choose a persona (food bank, fridge operator, donor).
3. Switch personas from the top bar. All three share one local dataset stored in your browser (`localStorage`), so actions in one role show up in the others. **Reset demo data** is in the account menu.

### The demonstration flow

1. Landing page → scroll the tour → **Connect to your community** → **Explore the demo**.
2. As **Maya (food bank)**: Rescue missions → **Create mission** (e.g. 10 cartons of milk, drop-off at Montrose Corner Fridge) → **Publish**.
3. Switch to **Priya (donor)**: Missions → the new mission appears → **Join** → **View details** → **Record a proposed donation** → **Mark as delivered**.
4. Switch to **Daniel (operator)**: Overview → **Incoming donations** → **Accept**. The item lands in Inventory and an inventory event is logged.
5. Switch back to **Maya**: mission progress has advanced; when the goal is met the mission completes and reward allocations become **Eligible**.
6. As **Priya**: Leaderboard shows the new verified points; Rewards shows the eligible allocation → **Request verification**.
7. As **Maya**: Rewards → **Approve** → **Pay out**. Without Solana keys the payout is clearly labeled **Simulated**; with keys it is a real Devnet transfer with an explorer link.

Demo recognitions, donations, transactions, and sensor readings are synthetic and labeled as such throughout the UI.

## Configuration

Copy `.env.example` to `.env.local` and fill in what you have. Every variable is optional; features switch from demo to live individually.

| Feature | Variables | Behavior when missing |
| --- | --- | --- |
| Clerk authentication | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Sign-in/sign-up pages explain that live auth is off and offer demo mode. |
| TigerData / PostgreSQL | `DATABASE_URL` | Live dashboards show a clear error; demo mode is unaffected. |
| Gemini recognition | `GEMINI_API_KEY` (`GEMINI_MODEL` optional) | Camera scan returns a labeled demo recognition. |
| ElevenLabs voice | `ELEVENLABS_API_KEY` (`ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`) | `/api/voice` responds 501 "not configured". |
| Solana Devnet payouts | `SOLANA_PAYER_SECRET_KEY` (`SOLANA_RPC_URL` optional) | Payouts are simulated with a `SIMULATED…` signature and labeled. |
| Hardware ingest | `FRIDGE_INGEST_TOKEN` | `/api/sensors/ingest` rejects all requests. |
| Map tiles | `NEXT_PUBLIC_MAP_STYLE_URL` | Defaults to OpenFreeMap Positron (no key required). |

The landing page's **Clear about what is live** section reflects the current configuration.

### Live mode setup

1. **Clerk**: create an application, enable Google + email, and add the two keys. `src/proxy.ts` runs `clerkMiddleware` and gates `/dashboard` and `/onboarding`. After sign-up, users pick a primary role at `/onboarding`; memberships are stored in Clerk public metadata and mirrored to the database.
2. **Database**: point `DATABASE_URL` at a TigerData (TimescaleDB) or plain PostgreSQL instance, then:
   ```bash
   npx drizzle-kit push                      # creates tables from src/lib/database/schema.ts
   psql "$DATABASE_URL" -f src/lib/database/sql/hypertable.sql   # TigerData only: hypertable for sensor readings
   ```
3. **Hardware**: the Arduino-compatible board posts readings with
   ```bash
   curl -X POST https://your-host/api/sensors/ingest \
     -H "Authorization: Bearer $FRIDGE_INGEST_TOKEN" -H "content-type: application/json" \
     -d '{"fridgeId":"fridge_xxx","readings":[{"metric":"temperature","value":3.4},{"metric":"air_quality","value":640}]}'
   ```
   Out-of-range readings create alerts automatically.
4. **Solana**: generate a Devnet payer (`solana-keygen new`), fund it with `solana airdrop 2 --url devnet`, and set `SOLANA_PAYER_SECRET_KEY` to the JSON byte array or base58 string. Signing happens only on the server in `src/lib/integrations/solana.ts`.

## Architecture

```
src/
  app/
    page.tsx                    Landing page + 3D tour
    demo/ sign-in/ sign-up/ onboarding/
    dashboard/
      layout.tsx                Session → DataModeProvider → DashboardShell
      food-bank/ operator/ donor/   Role layouts enforce membership server-side
    api/                        Route handlers (live mode), validated with zod, authorized against the DB
  components/
    landing/  three/            Tour, scroll timeline, 3D stage, fallback blockout, hotspots
    dashboard/                  Shell, sidebar, persona switcher, auth frames
    food-bank/ operator/ donor/ missions/ rewards/ inventory/ sensors/ maps/ shared/ ui/
  lib/
    auth/                       Session helper (Clerk or demo persona cookie)
    data/                       useFridgeyData(): demo store or live API, shared FridgeyActions interface
    demo/                       Seeded demo dataset + persistent zustand store
    database/                   Drizzle schema, repository, authorization helpers
    integrations/               Gemini, ElevenLabs, Solana, integration status
    three/                      Tour config, tour state, Blender asset adapter
  types/                        Shared domain types
public/
  models/                       Drop fridge.glb here (see public/models/README.md)
  images/                       Kitchen backdrop and renders from the Blender project
```

### Data access

Every dashboard reads and writes through `useFridgeyData()` (`src/lib/data/use-fridgey-data.ts`), which returns the dataset, an actions object, and the current user id. In demo mode the actions mutate the persistent local store (`src/lib/demo/store.ts`). In live mode the same interface posts to `/api/*` and re-fetches `/api/dataset`, which is scoped server-side by role, organization, fridge ownership, and the operator's sharing preferences. Migrating a feature from demo to live means implementing its route handler and repository function; components do not change.

### Authorization

- `src/proxy.ts` is an optimistic gate only. Real checks live in the route handlers and `src/lib/database/authorize.ts`: operators can only change their own fridge, food-bank admins only their organization, donors only their own donations and wallet.
- Donation verification (accept/reject) is reserved for the fridge operator. Points and mission progress are only ever derived from accepted donations.
- Reward payouts require an `approved` allocation (verified completion + administrator approval) and an admin of the paying organization; `/api/rewards/payout` re-checks the status before signing.
- Demo personas are a cookie that selects synthetic data. They cannot reach live routes.

### 3D tour and Blender assets

The landing page renders the real Blender scene (`blender/smart_fridge_final.blend`) with React Three Fiber: `public/models/fridge.glb` (rig with hinged doors, bins, food, sensors, cameras, speaker, Arduino) and `public/models/kitchen.glb` (cabinetry, counters, plants). See `public/models/README.md` for the export pipeline, object-name contract, and the corrections made during conversion.

- `src/lib/three/tour-config.ts`: the eight stages with camera position, Blender rotation and lens (from `Camera_Tour` keyframes), door angle, cover reveal, hotspots and copy.
- `src/lib/three/blender-camera.ts`: Z-up → Y-up conversion and lens → FOV with Blender's sensor-fit rules, so framing matches the renders.
- `src/lib/three/asset-adapter.ts`: builds a `FridgeRig` (door pivots, cover parts, label anchors) from the GLB; falls back to the blockout in `src/components/three/fridge-model.tsx` if the model cannot load.
- `src/components/three/fridge-showcase.tsx`: the kitchen is drawn unlit from its baked Cycles lightmaps; the fridge is lit by a Cycles-rendered HDR of the kitchen plus one window light for self-shadowing, AgX tone mapping at the scene's exposure, adaptive pixel ratio. A loading screen covers the stage until the models and HDR are in.
- The hero shows the Cycles kitchen render with the real-time fridge composited into the niche, then cross-fades to the 3D kitchen as the camera moves in. Scroll is driven by GSAP ScrollTrigger (scrubbed); **Play tour** uses ScrollToPlugin so autoplay and manual scrolling share one path. Reduced motion steps between stages; low-memory devices keep the rendered backdrop throughout; browsers without WebGL get a static version of the tour built from the renders.

The Blender source scene (`smart_fridge_final.blend`, about 115 MB) is not in the repository because it exceeds GitHub's file-size limit; ask the team for it and place it in `frontend/blender/`. Only `blender/fridge.glb` and `blender/camera_reference.json` are tracked. To re-export after changing the Blender file:

```bash
# fridge: export the SmartFridge collection from Blender to blender/fridge.glb, then
node scripts/optimize-assets.mjs blender/fridge.glb public/models/fridge.glb
# kitchen: bake materials AND Cycles lighting to atlases, render the HDR environment, then optimize
/Applications/Blender.app/Contents/MacOS/Blender -b blender/smart_fridge_final.blend --python scripts/bake-kitchen.py -- /tmp/kitchen_lit.glb public/images/kitchen-env.hdr /tmp/bake 256
node scripts/optimize-assets.mjs /tmp/kitchen_lit.glb public/models/kitchen.glb --join \
  --keep-names "^KIT_(Upper_Bridge|Bridge_|Filler_Header|Niche_Reveal_Top)" --keep-size "^kitchen_"
```

## Scripts

```bash
npm run dev     # development server
npm run build   # production build (type-checks)
npm run start   # serve the production build
npm run lint    # eslint
```

Deploys to Vercel: import the repository and set **Root Directory** to `frontend`. Set the environment variables in the project settings to enable live features.
