PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS currency_settings (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
  display_enabled INTEGER NOT NULL DEFAULT 0 CHECK(display_enabled IN (0,1)),
  display_currency TEXT,
  rate_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(rate_mode IN ('fixed','api')),
  fixed_rate_numerator TEXT,
  fixed_rate_denominator TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(display_enabled = 0 OR (display_currency IS NOT NULL AND length(display_currency) = 3))
);

CREATE TABLE IF NOT EXISTS currency_rate_cache (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  numerator TEXT NOT NULL,
  denominator TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('fixed','exchange-rate-api')),
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  lease_expires_at TEXT,
  PRIMARY KEY(restaurant_id, base_currency, quote_currency)
);

INSERT OR IGNORE INTO currency_settings(restaurant_id) SELECT id FROM restaurants;
