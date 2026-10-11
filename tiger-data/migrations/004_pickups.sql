BEGIN;
CREATE TABLE IF NOT EXISTS fridge.pickup_authorizations (
 id uuid PRIMARY KEY, user_id text NOT NULL, username text NOT NULL,
 fridge_id text NOT NULL REFERENCES fridge.fridges(id),
 mission_id uuid, mission_title text,
 role text NOT NULL CHECK(role IN ('food_bank','volunteer')),
 code_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, authenticated_at timestamptz, completed_at timestamptz,
 product_id uuid REFERENCES fridge.products(id), quantity integer CHECK(quantity>0),
 points integer NOT NULL DEFAULT 0 CHECK(points IN (0,10)), evidence jsonb NOT NULL DEFAULT '{}',
 CHECK(role='food_bank' OR mission_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pickup_account_completed ON fridge.pickup_authorizations(user_id,completed_at DESC);
GRANT SELECT,INSERT,UPDATE ON fridge.pickup_authorizations TO fridge_app;
INSERT INTO fridge.schema_migrations(version) VALUES('004_pickups') ON CONFLICT DO NOTHING;
COMMIT;
