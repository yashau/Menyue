PRAGMA foreign_keys = ON;

ALTER TABLE order_lines ADD COLUMN note TEXT;

CREATE TRIGGER IF NOT EXISTS beverage_prompt_item_same_restaurant
BEFORE INSERT ON beverage_prompt_items BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM menu_items i JOIN menu_categories c ON c.id=i.category_id
    WHERE i.id=NEW.item_id AND c.restaurant_id=NEW.restaurant_id
  ) THEN RAISE(ABORT,'beverage item must belong to restaurant') END;
END;
CREATE TRIGGER IF NOT EXISTS beverage_prompt_category_same_restaurant
BEFORE INSERT ON beverage_prompt_categories BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM menu_categories c WHERE c.id=NEW.category_id AND c.restaurant_id=NEW.restaurant_id
  ) THEN RAISE(ABORT,'beverage category must belong to restaurant') END;
END;
CREATE TRIGGER IF NOT EXISTS item_suggestions_audit_update
AFTER UPDATE ON item_suggestions BEGIN
  INSERT INTO audit_log(id,action,target_type,target_id,detail_json)
  VALUES(lower(hex(randomblob(16))),'menu.suggestion.updated','item',NEW.item_id,json_object('suggestedItemId',NEW.suggested_item_id,'enabled',NEW.enabled,'position',NEW.position));
END;
