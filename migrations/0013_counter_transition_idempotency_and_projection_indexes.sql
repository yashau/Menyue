PRAGMA foreign_keys = ON;

-- A status event is the durable record for one optimistic-concurrency attempt.
-- Keep older event rows readable while making newly written counter transitions
-- idempotent even if two identical requests observe the same old version.
ALTER TABLE order_events ADD COLUMN transition_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS order_events_counter_transition_key_idx
  ON order_events(transition_key)
  WHERE transition_key IS NOT NULL;

-- The counter projection selects a restaurant's active work plus a bounded
-- recent closed history, then joins its line and choice rows by parent key.
CREATE INDEX IF NOT EXISTS orders_counter_status_updated_idx
  ON orders(restaurant_id, status, updated_at DESC, display_number DESC);
CREATE INDEX IF NOT EXISTS order_lines_order_idx ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS order_line_choices_line_idx ON order_line_choices(line_id);
