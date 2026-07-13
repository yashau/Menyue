PRAGMA foreign_keys = ON;

-- Customer-facing presentation is tenant scoped. Legacy content gets the
-- familiar palette while the application still projects safe defaults for
-- partial/older rows.
ALTER TABLE site_content ADD COLUMN logo_asset_id TEXT REFERENCES media_assets(id);
ALTER TABLE site_content ADD COLUMN primary_color TEXT DEFAULT '#18372F';
ALTER TABLE site_content ADD COLUMN accent_color TEXT DEFAULT '#EC6A45';

UPDATE site_content
SET primary_color=COALESCE(primary_color, '#18372F'),
    accent_color=COALESCE(accent_color, '#EC6A45');
