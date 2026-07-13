PRAGMA foreign_keys = ON;
ALTER TABLE menu_items ADD COLUMN image_url TEXT;
ALTER TABLE menu_items ADD COLUMN dietary_labels TEXT;
ALTER TABLE menu_items ADD COLUMN tags TEXT;
ALTER TABLE combo_choices ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1));
