PRAGMA foreign_keys = ON;

ALTER TABLE restaurants ADD COLUMN currency_minor_unit INTEGER NOT NULL DEFAULT 2;
ALTER TABLE restaurants ADD COLUMN currency_locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE restaurants ADD COLUMN money_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurants ADD COLUMN rate_revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS restaurant_currencies (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  currency_code TEXT NOT NULL,
  minor_unit INTEGER NOT NULL DEFAULT 2 CHECK(minor_unit BETWEEN 0 AND 4),
  locale TEXT NOT NULL DEFAULT 'en',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  is_base INTEGER NOT NULL DEFAULT 0 CHECK(is_base IN (0,1)),
  rate_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(rate_mode IN ('fixed','api')),
  fixed_numerator TEXT,
  fixed_denominator TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(restaurant_id,currency_code),
  CHECK(length(currency_code)=3)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_base_currency ON restaurant_currencies(restaurant_id) WHERE is_base=1;

CREATE TABLE IF NOT EXISTS currency_rate_sync (
  restaurant_id TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  numerator TEXT NOT NULL,
  denominator TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('fixed','exchange-rate-api')),
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(restaurant_id,base_currency,quote_currency)
);

CREATE TABLE IF NOT EXISTS order_money_snapshots (
  order_id TEXT NOT NULL REFERENCES orders(id),
  currency_code TEXT NOT NULL,
  minor_unit INTEGER NOT NULL,
  locale TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  rate_numerator TEXT,
  rate_denominator TEXT,
  rate_source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(order_id,currency_code)
);

INSERT OR IGNORE INTO restaurant_currencies(restaurant_id,currency_code,minor_unit,locale,enabled,is_base,rate_mode,updated_at)
SELECT id,currency,currency_minor_unit,currency_locale,1,1,'fixed',unixepoch() FROM restaurants;
INSERT OR IGNORE INTO order_money_snapshots(order_id,currency_code,minor_unit,locale,total_minor)
SELECT o.id,o.currency,2,'en',o.total_minor FROM orders o;
