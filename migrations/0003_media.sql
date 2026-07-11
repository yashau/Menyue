-- Item photos are uploaded in-app and stored in R2; this column holds the R2
-- object key. External URL linking has been removed (image_url is now unused).
ALTER TABLE items ADD COLUMN image_key TEXT;
