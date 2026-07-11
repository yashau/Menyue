-- Separate "shown in the browse menu" from "orderable". An item with listed=0
-- is hidden from the customer menu grid/search but can still be a suggestion
-- target and ordered (e.g. poppadums, extra sauce).
ALTER TABLE items ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
