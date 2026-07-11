-- Per-restaurant branding & custom item imagery.
ALTER TABLE restaurants ADD COLUMN theme_primary TEXT NOT NULL DEFAULT '#0d6d5b';
ALTER TABLE restaurants ADD COLUMN theme_accent TEXT NOT NULL DEFAULT '#de5f34';
ALTER TABLE items ADD COLUMN image_url TEXT;
