BEGIN;
CREATE TABLE IF NOT EXISTS fridge.reward_wallets(user_id text PRIMARY KEY,address text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fridge.rewards(id uuid PRIMARY KEY, user_id text NOT NULL, organization_id text NOT NULL, mission_title text NOT NULL, amount_sol numeric NOT NULL CHECK(amount_sol>0 AND amount_sol<=10), status text NOT NULL CHECK(status IN ('eligible','pending_verification','approved','processing','paid','failed','uncertain','rejected')), verified_at timestamptz, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), recipient_address text, signature text, network text NOT NULL DEFAULT 'devnet' CHECK(network='devnet'));
CREATE INDEX IF NOT EXISTS rewards_user_created ON fridge.rewards(user_id,created_at DESC);
GRANT SELECT,INSERT,UPDATE ON fridge.reward_wallets,fridge.rewards TO fridge_app;
INSERT INTO fridge.schema_migrations(version) VALUES('003_rewards') ON CONFLICT DO NOTHING;
COMMIT;
