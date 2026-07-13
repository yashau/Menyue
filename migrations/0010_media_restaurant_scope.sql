PRAGMA foreign_keys = ON;

-- Uploads are created through restaurant-scoped admin actions.  Existing
-- records predate tenancy and remain readable public customer assets.
ALTER TABLE media_assets ADD COLUMN restaurant_id TEXT REFERENCES restaurants(id);
CREATE INDEX IF NOT EXISTS media_assets_restaurant_idx ON media_assets(restaurant_id, state);
