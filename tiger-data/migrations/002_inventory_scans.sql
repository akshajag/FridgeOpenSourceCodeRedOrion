BEGIN;
CREATE TABLE IF NOT EXISTS fridge.item_scans (
  id uuid PRIMARY KEY,
  fridge_id text NOT NULL REFERENCES fridge.fridges(id),
  captured_at timestamptz NOT NULL,
  result jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scans_fridge_time ON fridge.item_scans(fridge_id,captured_at DESC);
GRANT SELECT, INSERT ON fridge.item_scans TO fridge_app;
INSERT INTO fridge.schema_migrations(version) VALUES('002_inventory_scans') ON CONFLICT DO NOTHING;
COMMIT;
