PRAGMA foreign_keys = ON;

ALTER TABLE admin_mutation_lock ADD COLUMN enabled_admins INTEGER NOT NULL DEFAULT 0;
UPDATE admin_mutation_lock
SET enabled_admins = (SELECT COUNT(*) FROM users WHERE role = 'admin' AND enabled = 1)
WHERE id = 1;

CREATE TRIGGER IF NOT EXISTS users_enabled_admin_insert
AFTER INSERT ON users
WHEN NEW.role = 'admin' AND NEW.enabled = 1
BEGIN
  UPDATE admin_mutation_lock SET enabled_admins = enabled_admins + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS users_keep_enabled_admin_update
BEFORE UPDATE OF role, enabled ON users
WHEN OLD.role = 'admin' AND OLD.enabled = 1
  AND NOT (NEW.role = 'admin' AND NEW.enabled = 1)
BEGIN
  SELECT RAISE(ABORT, 'Keep one enabled admin')
  WHERE (SELECT enabled_admins FROM admin_mutation_lock WHERE id = 1) <= 1;
  UPDATE admin_mutation_lock SET enabled_admins = enabled_admins - 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS users_enabled_admin_promote
BEFORE UPDATE OF role, enabled ON users
WHEN NOT (OLD.role = 'admin' AND OLD.enabled = 1)
  AND NEW.role = 'admin' AND NEW.enabled = 1
BEGIN
  UPDATE admin_mutation_lock SET enabled_admins = enabled_admins + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS users_keep_enabled_admin_delete
BEFORE DELETE ON users
WHEN OLD.role = 'admin' AND OLD.enabled = 1
BEGIN
  SELECT RAISE(ABORT, 'Keep one enabled admin')
  WHERE (SELECT enabled_admins FROM admin_mutation_lock WHERE id = 1) <= 1;
  UPDATE admin_mutation_lock SET enabled_admins = enabled_admins - 1 WHERE id = 1;
END;
