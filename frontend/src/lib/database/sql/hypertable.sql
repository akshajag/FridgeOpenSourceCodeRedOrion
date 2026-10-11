-- Run once after `drizzle-kit push` on a TigerData / TimescaleDB database.
-- Converts the sensor readings table into a hypertable partitioned by time.
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('sensor_readings', 'at', if_not_exists => TRUE, migrate_data => TRUE);
-- Optional: keep raw readings for 90 days.
-- SELECT add_retention_policy('sensor_readings', INTERVAL '90 days');
