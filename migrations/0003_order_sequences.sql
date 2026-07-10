CREATE TABLE IF NOT EXISTS order_sequences (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
  next_number INTEGER NOT NULL CHECK(next_number > 0)
);

INSERT OR IGNORE INTO order_sequences(restaurant_id, next_number)
SELECT r.id, COALESCE(MAX(o.display_number), 0) + 1
FROM restaurants r
LEFT JOIN orders o ON o.restaurant_id = r.id
GROUP BY r.id;
