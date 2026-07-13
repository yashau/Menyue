-- This singleton stores the enabled-admin invariant. The next migration adds
-- triggers that update it in the same statement as each user-role mutation.
CREATE TABLE IF NOT EXISTS admin_mutation_lock (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO admin_mutation_lock(id) VALUES(1);
