PRAGMA foreign_keys = ON;

-- Counter access is deliberately tenant-bound.  `normalized_username` is the
-- canonical lower-case, trimmed login value; display_name remains presentation
-- data and no plaintext credential is ever stored.
CREATE TABLE IF NOT EXISTS counter_operators (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  normalized_username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  auth_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, normalized_username)
);
CREATE INDEX IF NOT EXISTS counter_operators_tenant_enabled_idx
  ON counter_operators(restaurant_id, enabled, normalized_username);

-- These fields make the durable status history independently auditable. They
-- are additive so existing customer-created events remain readable with NULL
-- actor metadata.
ALTER TABLE order_events ADD COLUMN actor_id TEXT;
ALTER TABLE order_events ADD COLUMN actor_name TEXT;
ALTER TABLE order_events ADD COLUMN actor_type TEXT;
CREATE INDEX IF NOT EXISTS order_events_actor_idx
  ON order_events(order_id, actor_type, actor_id, created_at);
