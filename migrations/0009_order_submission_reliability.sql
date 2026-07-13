PRAGMA foreign_keys = ON;

-- Bind an idempotency key to the exact customer request that first used it.
ALTER TABLE orders ADD COLUMN request_fingerprint TEXT NOT NULL DEFAULT '';

-- A durable record of the customer-visible order lifecycle event.  This is
-- intentionally written in the same batch as the order and its lines; the
-- realtime notification is only a best-effort projection of this record.
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS order_events_order_created_idx ON order_events(order_id, created_at);
