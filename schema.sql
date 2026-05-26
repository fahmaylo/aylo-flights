-- Aylo Flight Alert — Database Schema
-- Run once on your Postgres database:
--   psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,

  -- Route (single airports or comma-separated for multi-airport cities)
  origin            TEXT NOT NULL,        -- e.g. "SFO" or "JFK,LGA,EWR"
  destination       TEXT NOT NULL,        -- e.g. "CDG,ORY"
  origin_city       TEXT,                  -- e.g. "San Francisco" (for display)
  destination_city  TEXT,                  -- e.g. "Paris"

  -- Trip preferences
  min_nights        INT NOT NULL,
  max_nights        INT NOT NULL,
  travel_window     TEXT NOT NULL,        -- '3mo' | '6mo' | '12mo'
  target_price      INT NOT NULL,

  -- Lifecycle
  created_at        TIMESTAMP DEFAULT NOW(),
  expires_at        TIMESTAMP NOT NULL,

  -- Last poll snapshot (used by the LP and to dedupe email sends)
  last_polled_at    TIMESTAMP,
  last_emailed_at   TIMESTAMP,
  last_best_price   INT,
  last_best_departure DATE,
  last_best_return  DATE
);

-- Index for polling (only active alerts)
CREATE INDEX IF NOT EXISTS idx_alerts_active
  ON alerts (expires_at)
  WHERE expires_at > NOW();

-- Index for grouping by route during polling
CREATE INDEX IF NOT EXISTS idx_alerts_route
  ON alerts (origin, destination)
  WHERE expires_at > NOW();

-- Cache for price preview chart data (per route + trip length combo)
CREATE TABLE IF NOT EXISTS preview_cache (
  cache_key         TEXT PRIMARY KEY,       -- e.g. "SFO|CDG,ORY|5|7"
  data              JSONB NOT NULL,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preview_cache_created
  ON preview_cache (created_at);
