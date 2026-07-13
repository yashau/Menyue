PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS item_suggestions (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  suggested_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(item_id,suggested_item_id),
  CHECK(item_id <> suggested_item_id)
);
CREATE INDEX IF NOT EXISTS item_suggestions_source_idx ON item_suggestions(restaurant_id,item_id,enabled,position);
CREATE TRIGGER IF NOT EXISTS item_suggestions_same_restaurant_insert
BEFORE INSERT ON item_suggestions BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM menu_items a JOIN menu_categories ac ON ac.id=a.category_id
    JOIN menu_items b JOIN menu_categories bc ON bc.id=b.category_id
    WHERE a.id=NEW.item_id AND b.id=NEW.suggested_item_id AND ac.restaurant_id=NEW.restaurant_id AND bc.restaurant_id=NEW.restaurant_id
  ) THEN RAISE(ABORT,'suggestions must belong to restaurant') END;
END;
CREATE TABLE IF NOT EXISTS beverage_prompt_settings (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  heading TEXT NOT NULL DEFAULT 'Something to drink?',
  body TEXT NOT NULL DEFAULT 'Add a drink before we send your order.',
  skip_label TEXT NOT NULL DEFAULT 'No thanks, send order',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS beverage_prompt_items (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  PRIMARY KEY(restaurant_id,item_id)
);
CREATE TABLE IF NOT EXISTS beverage_prompt_categories (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  PRIMARY KEY(restaurant_id,category_id)
);
INSERT OR IGNORE INTO beverage_prompt_settings(restaurant_id) SELECT id FROM restaurants;
