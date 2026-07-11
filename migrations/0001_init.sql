-- Menyue initial schema
-- All money stored as integer minor units in the restaurant BASE currency.
-- Display-currency conversion is presentational only and never authoritative.

CREATE TABLE restaurants (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT NOT NULL UNIQUE,
	-- Base currency metadata
	base_code TEXT NOT NULL DEFAULT 'MVR',
	base_symbol TEXT NOT NULL DEFAULT 'Rf',
	base_precision INTEGER NOT NULL DEFAULT 2,
	base_symbol_position TEXT NOT NULL DEFAULT 'before', -- 'before' | 'after'
	settings_revision INTEGER NOT NULL DEFAULT 1,
	-- Currency behaviour
	multi_currency_enabled INTEGER NOT NULL DEFAULT 1,
	conversion_mode TEXT NOT NULL DEFAULT 'api', -- 'fixed' | 'api'
	-- Beverage prompt
	beverage_prompt_enabled INTEGER NOT NULL DEFAULT 1,
	beverage_prompt_heading TEXT NOT NULL DEFAULT 'Anything to drink?',
	beverage_prompt_body TEXT NOT NULL DEFAULT 'Add a refreshing drink before you send your order to the kitchen.',
	beverage_prompt_skip_label TEXT NOT NULL DEFAULT 'No thanks, send order',
	-- Link generation
	app_origin TEXT,
	next_order_seq INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Display currencies (in addition to the base currency)
CREATE TABLE currencies (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	code TEXT NOT NULL,
	symbol TEXT NOT NULL,
	precision INTEGER NOT NULL DEFAULT 2,
	symbol_position TEXT NOT NULL DEFAULT 'before',
	display_order INTEGER NOT NULL DEFAULT 0,
	enabled INTEGER NOT NULL DEFAULT 1,
	mode TEXT NOT NULL DEFAULT 'api', -- 'fixed' | 'api'
	-- rate = amount of THIS currency per 1 unit of base currency
	fixed_rate REAL,
	fallback_rate REAL NOT NULL DEFAULT 1,
	UNIQUE (restaurant_id, code)
);

-- Cache of fetched exchange rates (one row per restaurant+currency)
CREATE TABLE rate_cache (
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	code TEXT NOT NULL,
	base_code TEXT NOT NULL,
	rate REAL NOT NULL,
	provider TEXT NOT NULL,
	fetched_at INTEGER NOT NULL,
	PRIMARY KEY (restaurant_id, code)
);

-- Atomic refresh lease so only one worker refreshes provider rates at a time
CREATE TABLE rate_lease (
	restaurant_id INTEGER PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
	owner TEXT NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE TABLE categories (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	description TEXT,
	display_order INTEGER NOT NULL DEFAULT 0,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_categories_restaurant ON categories(restaurant_id, display_order);

CREATE TABLE items (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
	name TEXT NOT NULL,
	description TEXT,
	base_price INTEGER NOT NULL DEFAULT 0, -- minor units, base currency
	image_seed TEXT NOT NULL DEFAULT 'dish',
	availability TEXT NOT NULL DEFAULT 'available', -- 'available' | 'unavailable'
	enabled INTEGER NOT NULL DEFAULT 1,
	allergens TEXT NOT NULL DEFAULT '[]', -- json array
	dietary TEXT NOT NULL DEFAULT '[]',   -- json array
	tags TEXT NOT NULL DEFAULT '[]',      -- json array (searchable)
	label TEXT,                            -- promotional / informational label
	label_kind TEXT DEFAULT 'info',        -- 'info' | 'promo' | 'new'
	is_beverage INTEGER NOT NULL DEFAULT 0,
	display_order INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_items_restaurant ON items(restaurant_id, category_id, display_order);

CREATE TABLE option_groups (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	selection_type TEXT NOT NULL DEFAULT 'single', -- 'single' | 'multiple'
	required INTEGER NOT NULL DEFAULT 0,
	min_select INTEGER NOT NULL DEFAULT 0,
	max_select INTEGER NOT NULL DEFAULT 1,
	allow_none INTEGER NOT NULL DEFAULT 0,
	display_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_option_groups_item ON option_groups(item_id, display_order);

CREATE TABLE option_choices (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	group_id INTEGER NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	price_adjustment INTEGER NOT NULL DEFAULT 0, -- minor units, base currency
	is_default INTEGER NOT NULL DEFAULT 0,
	display_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_option_choices_group ON option_choices(group_id, display_order);

CREATE TABLE suggestions (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	source_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	target_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	display_order INTEGER NOT NULL DEFAULT 0,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	UNIQUE (restaurant_id, source_item_id, target_item_id),
	CHECK (source_item_id <> target_item_id)
);
CREATE INDEX idx_suggestions_source ON suggestions(source_item_id, display_order);

CREATE TABLE beverage_prompt_items (
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	display_order INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (restaurant_id, item_id)
);

CREATE TABLE beverage_prompt_categories (
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
	PRIMARY KEY (restaurant_id, category_id)
);

CREATE TABLE tables (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	label TEXT NOT NULL,
	token TEXT NOT NULL UNIQUE,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE users (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	username TEXT NOT NULL,
	display_name TEXT NOT NULL,
	role TEXT NOT NULL, -- 'admin' | 'manager' | 'counter'
	password_hash TEXT NOT NULL,
	password_salt TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	UNIQUE (restaurant_id, username)
);

CREATE TABLE sessions (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	csrf_secret TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	expires_at INTEGER NOT NULL
);

CREATE TABLE orders (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	table_id INTEGER NOT NULL REFERENCES tables(id),
	order_number TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'new', -- new|accepted|preparing|completed|cancelled
	subtotal_base INTEGER NOT NULL DEFAULT 0,
	total_base INTEGER NOT NULL DEFAULT 0,
	currency_snapshot TEXT NOT NULL DEFAULT '{}', -- immutable money-formatting snapshot
	notes TEXT,
	idempotency_key TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
	accepted_at INTEGER,
	completed_at INTEGER,
	UNIQUE (restaurant_id, idempotency_key)
);
CREATE INDEX idx_orders_board ON orders(restaurant_id, status, created_at);

CREATE TABLE order_items (
	id INTEGER PRIMARY KEY,
	order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	item_id INTEGER REFERENCES items(id),
	name_snapshot TEXT NOT NULL,
	unit_base_price INTEGER NOT NULL,
	quantity INTEGER NOT NULL,
	line_total_base INTEGER NOT NULL,
	options_snapshot TEXT NOT NULL DEFAULT '[]',
	notes TEXT,
	is_suggested INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Server-issued idempotency keys (issued before submission; scoped to table)
CREATE TABLE idempotency_keys (
	key TEXT PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
	order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
	issued_at INTEGER NOT NULL DEFAULT (unixepoch()),
	consumed_at INTEGER
);

CREATE TABLE audit_log (
	id INTEGER PRIMARY KEY,
	restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
	actor TEXT,
	action TEXT NOT NULL,
	entity_type TEXT,
	entity_id INTEGER,
	detail TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_restaurant ON audit_log(restaurant_id, created_at);
