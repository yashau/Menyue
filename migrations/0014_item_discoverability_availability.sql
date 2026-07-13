PRAGMA foreign_keys = ON;

-- Existing items remain visible in menu browsing and available for ordering.
ALTER TABLE menu_items ADD COLUMN discoverability TEXT NOT NULL DEFAULT 'browse'
  CHECK(discoverability IN ('browse','suggestion_only'));
ALTER TABLE menu_items ADD COLUMN availability TEXT NOT NULL DEFAULT 'available'
  CHECK(availability IN ('available','sold_out'));

CREATE INDEX IF NOT EXISTS items_customer_availability_idx
  ON menu_items(category_id, enabled, archived, discoverability, availability, position);
CREATE INDEX IF NOT EXISTS item_suggestions_target_availability_idx
  ON item_suggestions(restaurant_id, suggested_item_id, enabled, position);
