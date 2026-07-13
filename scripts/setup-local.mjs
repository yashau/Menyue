import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDirectory = resolve(root, process.env.MENYUE_LOCAL_STATE_DIRECTORY ?? '.wrangler/state');
const devVarsPath = resolve(root, '.dev.vars');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'menyue-admin-local';
const MANAGER_USERNAME = 'manager';
const MANAGER_PASSWORD = 'menyue-manager-local';
const COUNTER_PASSWORD = 'menyue-counter-local';
const COUNTER_USERNAME = 'counter';
const TABLE_TOKEN = 'table-one-local';
const UPLOADED_MENU_ASSET = {
	id: 'local-asset-seasoned-fries',
	key: 'fixture/seasoned-fries.png',
	file: resolve(root, 'static/menu/mas-huni.png'),
	contentType: 'image/png',
};
const R2_UPLOAD_ATTEMPTS = 3;
const R2_RETRY_DELAY_MS = 100;
const LOCAL_R2_FAULT = process.env.MENYUE_LOCAL_R2_FAULT ?? '';
const localR2Faults = new Map();

function readVariable(source, name) {
	const match = source.match(new RegExp(`^${name}\\s*=\\s*(.*)$`, 'm'));
	if (!match) return undefined;
	return match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
}

function ensurePepper() {
	const existing = existsSync(devVarsPath) ? readFileSync(devVarsPath, 'utf8') : '';
	const configured = readVariable(existing, 'AUTH_PEPPER');
	if (configured && configured !== 'replace-me-with-a-random-local-value') return configured;

	const pepper = randomBytes(32).toString('base64url');
	const prefix = existing.trim() ? `${existing.trimEnd()}\n` : '';
	writeFileSync(devVarsPath, `${prefix}AUTH_PEPPER="${pepper}"\n`, {
		encoding: 'utf8',
		mode: 0o600,
	});
	console.log('Created ignored .dev.vars with a random local AUTH_PEPPER.');
	return pepper;
}

function hashPassword(value, pepper) {
	const salt = randomBytes(24).toString('base64url');
	return {
		salt,
		hash: pbkdf2Sync(value + pepper, salt, 210_000, 32, 'sha256').toString('base64url'),
	};
}

function sqlString(value) {
	return `'${value.replaceAll("'", "''")}'`;
}

function runWrangler(args) {
	execFileSync(process.execPath, [wrangler, ...args], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
	});
}

function pause(milliseconds) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function faultR2Operation(operation) {
	if (!LOCAL_R2_FAULT) return;
	const match = LOCAL_R2_FAULT.match(/^(upload|verify)-(once|always)$/);
	if (!match)
		throw new Error(
			`Unsupported MENYUE_LOCAL_R2_FAULT value ${JSON.stringify(LOCAL_R2_FAULT)}. Use upload-once, verify-once, upload-always, or verify-always.`,
		);
	const [, faultOperation, frequency] = match;
	if (faultOperation !== operation) return;
	const failures = localR2Faults.get(operation) ?? 0;
	if (frequency === 'once' && failures > 0) return;
	localR2Faults.set(operation, failures + 1);
	throw new Error(`Injected local R2 ${operation} failure (${frequency}).`);
}

function verifyLocalR2Object(asset, expectedHash) {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), 'menyue-local-r2-verify-'));
	const downloadedFile = join(temporaryDirectory, 'object');
	try {
		faultR2Operation('verify');
		runWrangler([
			'r2',
			'object',
			'get',
			`menyue-media/${asset.key}`,
			'--local',
			'--persist-to',
			stateDirectory,
			'--file',
			downloadedFile,
		]);
		if (!existsSync(downloadedFile))
			throw new Error('R2 get completed without writing an object file.');
		const actualHash = createHash('sha256').update(readFileSync(downloadedFile)).digest('hex');
		if (actualHash !== expectedHash)
			throw new Error(
				`Retrieved object checksum ${actualHash} did not match expected checksum ${expectedHash}.`,
			);
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}

function uploadVerifiedLocalR2Object(asset, expectedHash) {
	let lastError;
	for (let attempt = 1; attempt <= R2_UPLOAD_ATTEMPTS; attempt += 1) {
		try {
			faultR2Operation('upload');
			runWrangler([
				'r2',
				'object',
				'put',
				`menyue-media/${asset.key}`,
				'--local',
				'--persist-to',
				stateDirectory,
				'--file',
				asset.file,
				'--content-type',
				asset.contentType,
			]);
			verifyLocalR2Object(asset, expectedHash);
			return;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			if (attempt === R2_UPLOAD_ATTEMPTS) break;
			const delay = R2_RETRY_DELAY_MS * attempt;
			console.warn(
				`Fixture R2 upload attempt ${attempt}/${R2_UPLOAD_ATTEMPTS} for ${asset.key} failed: ${lastError}. Retrying in ${delay}ms.`,
			);
			pause(delay);
		}
	}
	throw new Error(
		`Fixture R2 upload for ${asset.key} failed after ${R2_UPLOAD_ATTEMPTS} attempts; D1 media metadata was not changed. Last error: ${lastError}`,
	);
}

function queryLocalD1(command) {
	const output = execFileSync(
		process.execPath,
		[
			wrangler,
			'd1',
			'execute',
			'menyue',
			'--local',
			'--persist-to',
			stateDirectory,
			'--command',
			command,
			'--json',
		],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false },
	);
	const result = JSON.parse(output);
	if (!result[0]?.success) throw new Error('Unable to query local D1 state.');
	return result[0].results;
}

function passwordMatches(record, password, pepper) {
	if (
		typeof record?.password_hash !== 'string' ||
		typeof record.salt !== 'string' ||
		!Number.isInteger(record.iterations) ||
		record.iterations < 1
	)
		return false;
	const expected = Buffer.from(record.password_hash, 'base64url');
	const actual = pbkdf2Sync(password + pepper, record.salt, record.iterations, 32, 'sha256');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isValidLocalAdmin(record, pepper) {
	return (
		record?.id === 'local-admin' &&
		record.username === ADMIN_USERNAME &&
		record.display_name === 'Local administrator' &&
		record.role === 'admin' &&
		record.enabled === 1 &&
		record.must_change_password === 0 &&
		passwordMatches(record, ADMIN_PASSWORD, pepper)
	);
}

function isValidLocalManager(record, pepper) {
	return (
		record?.id === 'local-manager' &&
		record.username === MANAGER_USERNAME &&
		record.display_name === 'Local manager' &&
		record.role === 'manager' &&
		record.enabled === 1 &&
		record.must_change_password === 0 &&
		passwordMatches(record, MANAGER_PASSWORD, pepper)
	);
}

function isValidLocalCounter(record, pepper) {
	return record?.id === 'local-counter' && record.restaurant_id === 'demo' && record.normalized_username === COUNTER_USERNAME && record.display_name === 'Local counter operator' && record.enabled === 1 && passwordMatches(record, COUNTER_PASSWORD, pepper);
}

function isValidLocalTable(record, tokenHash) {
	return (
		record?.id === 'local-table-one' &&
		record.restaurant_id === 'demo' &&
		record.label === 'Table 1' &&
		record.token_hash === tokenHash &&
		record.token_hint === 'e-local' &&
		record.enabled === 1
	);
}

if (process.argv.includes('--reset')) {
	const pathFromRoot = relative(root, stateDirectory);
	if (
		!pathFromRoot ||
		pathFromRoot.startsWith(`..${sep}`) ||
		resolve(root, pathFromRoot) !== stateDirectory
	)
		throw new Error(`Refusing to remove local state outside the workspace: ${stateDirectory}`);
	rmSync(stateDirectory, { recursive: true, force: true });
	console.log('Cleared local Miniflare state.');
}

const pepper = ensurePepper();
runWrangler(['d1', 'migrations', 'apply', 'menyue', '--local', '--persist-to', stateDirectory]);

const existingAdmin = queryLocalD1(
	"SELECT id, username, display_name, role, password_hash, salt, iterations, enabled, must_change_password FROM users WHERE id='local-admin'",
)[0];
const resetAdmin = !isValidLocalAdmin(existingAdmin, pepper);
const repairExistingAdmin = Boolean(existingAdmin) && resetAdmin;
const admin = resetAdmin ? hashPassword(ADMIN_PASSWORD, pepper) : undefined;
const existingManager = queryLocalD1(
	"SELECT id, username, display_name, role, password_hash, salt, iterations, enabled, must_change_password FROM users WHERE id='local-manager'",
)[0];
const resetManager = !isValidLocalManager(existingManager, pepper);
const repairExistingManager = Boolean(existingManager) && resetManager;
const manager = resetManager ? hashPassword(MANAGER_PASSWORD, pepper) : undefined;
const tableHash = createHash('sha256').update(TABLE_TOKEN).digest('base64url');
const existingCounter = queryLocalD1(
	"SELECT id,restaurant_id,normalized_username,display_name,password_hash,salt,iterations,enabled FROM counter_operators WHERE id='local-counter'",
)[0];
const resetCounter = !isValidLocalCounter(existingCounter, pepper);
const repairExistingCounter = Boolean(existingCounter) && resetCounter;
const counter = resetCounter ? hashPassword(COUNTER_PASSWORD, pepper) : undefined;
const existingTable = queryLocalD1(
	"SELECT id, restaurant_id, label, token_hash, token_hint, enabled FROM dining_tables WHERE id='local-table-one'",
)[0];
const repairExistingTable = Boolean(existingTable) && !isValidLocalTable(existingTable, tableHash);
const uploadedMenuBytes = readFileSync(UPLOADED_MENU_ASSET.file);
const uploadedMenuHash = createHash('sha256').update(uploadedMenuBytes).digest('hex');

// Keep D1 metadata behind the object write: an upload or retrieval failure leaves
// the existing fixture rows untouched instead of creating a dangling asset record.
uploadVerifiedLocalR2Object(UPLOADED_MENU_ASSET, uploadedMenuHash);

const seedSql = `
INSERT OR IGNORE INTO users(id, username, display_name, role, password_hash, salt, iterations, must_change_password)
VALUES ('local-admin', ${sqlString(ADMIN_USERNAME)}, 'Local administrator', 'admin', ${sqlString(admin?.hash ?? '')}, ${sqlString(admin?.salt ?? '')}, 210000, 0);
${
	repairExistingAdmin
		? `
UPDATE users
SET username=${sqlString(ADMIN_USERNAME)}, display_name='Local administrator', role='admin',
    password_hash=${sqlString(admin.hash)}, salt=${sqlString(admin.salt)}, iterations=210000,
    enabled=1, must_change_password=0, auth_version=auth_version+1
WHERE id='local-admin';
`
		: ''
}
INSERT OR IGNORE INTO users(id, username, display_name, role, password_hash, salt, iterations, must_change_password)
VALUES ('local-manager', ${sqlString(MANAGER_USERNAME)}, 'Local manager', 'manager', ${sqlString(manager?.hash ?? '')}, ${sqlString(manager?.salt ?? '')}, 210000, 0);
${
	repairExistingManager
		? `
UPDATE users
SET username=${sqlString(MANAGER_USERNAME)}, display_name='Local manager', role='manager',
    password_hash=${sqlString(manager.hash)}, salt=${sqlString(manager.salt)}, iterations=210000,
    enabled=1, must_change_password=0, auth_version=auth_version+1
WHERE id='local-manager';
`
		: ''
}
INSERT OR IGNORE INTO counter_operators(id,restaurant_id,normalized_username,display_name,password_hash,salt,iterations)
VALUES ('local-counter','demo',${sqlString(COUNTER_USERNAME)},'Local counter operator',${sqlString(counter?.hash ?? '')},${sqlString(counter?.salt ?? '')},210000);
${
	repairExistingCounter
		? `
UPDATE counter_operators
SET restaurant_id='demo', normalized_username=${sqlString(COUNTER_USERNAME)}, display_name='Local counter operator',
    password_hash=${sqlString(counter.hash)}, salt=${sqlString(counter.salt)}, iterations=210000,
    enabled=1, auth_version=auth_version+1, updated_at=CURRENT_TIMESTAMP
WHERE id='local-counter';
`
		: ''
}

UPDATE restaurants
SET currency='USD', currency_minor_unit=2, currency_locale='en-US'
WHERE id='demo';

INSERT OR IGNORE INTO menu_categories(id, restaurant_id, code, name, description, position)
VALUES
  ('local-category-starters', 'demo', 'STARTERS', 'Starters', 'Small plates to begin with.', 0),
  ('local-category-mains', 'demo', 'MAINS', 'Mains', 'Freshly prepared house favourites.', 1),
  ('local-category-drinks', 'demo', 'DRINKS', 'Drinks', 'Cold drinks and house refreshments.', 2);
UPDATE menu_categories
SET restaurant_id='demo',
    code=CASE id WHEN 'local-category-starters' THEN 'STARTERS' WHEN 'local-category-mains' THEN 'MAINS' ELSE 'DRINKS' END,
    name=CASE id WHEN 'local-category-starters' THEN 'Starters' WHEN 'local-category-mains' THEN 'Mains' ELSE 'Drinks' END,
    description=CASE id WHEN 'local-category-starters' THEN 'Small plates to begin with.' WHEN 'local-category-mains' THEN 'Freshly prepared house favourites.' ELSE 'Cold drinks and house refreshments.' END,
    position=CASE id WHEN 'local-category-starters' THEN 0 WHEN 'local-category-mains' THEN 1 ELSE 2 END,
    enabled=1, archived=0
WHERE id IN ('local-category-starters','local-category-mains','local-category-drinks');

INSERT OR IGNORE INTO menu_items(id, category_id, code, name, description, base_price_minor, allergy_note, position)
VALUES
  ('local-item-fries', 'local-category-starters', 'FRIES', 'Seasoned fries', 'Crisp fries with house seasoning.', 650, NULL, 0),
  ('local-item-salad', 'local-category-starters', 'SALAD', 'Garden salad', 'Cucumber, tomato, greens and citrus dressing.', 750, NULL, 1),
  ('local-item-burger', 'local-category-mains', 'BURGER', 'Menyue burger', 'Beef patty, cheese, lettuce and house sauce.', 1450, 'Contains gluten and dairy.', 0);

INSERT OR IGNORE INTO menu_items(id, category_id, code, name, description, base_price_minor, allergy_note, position)
VALUES ('local-item-water', 'local-category-starters', 'WATER', 'Lime water', 'Chilled still water with a slice of lime.', 250, NULL, 9);

UPDATE menu_items
SET category_id=CASE id WHEN 'local-item-fries' THEN 'local-category-starters' WHEN 'local-item-salad' THEN 'local-category-starters' WHEN 'local-item-burger' THEN 'local-category-mains' ELSE 'local-category-starters' END,
    code=CASE id WHEN 'local-item-fries' THEN 'FRIES' WHEN 'local-item-salad' THEN 'SALAD' WHEN 'local-item-burger' THEN 'BURGER' ELSE 'WATER' END,
    name=CASE id WHEN 'local-item-fries' THEN 'Seasoned fries' WHEN 'local-item-salad' THEN 'Garden salad' WHEN 'local-item-burger' THEN 'Menyue burger' ELSE 'Lime water' END,
    description=CASE id WHEN 'local-item-fries' THEN 'Crisp fries with house seasoning.' WHEN 'local-item-salad' THEN 'Cucumber, tomato, greens and citrus dressing.' WHEN 'local-item-burger' THEN 'Beef patty, cheese, lettuce and house sauce.' ELSE 'Chilled still water with a slice of lime.' END,
    base_price_minor=CASE id WHEN 'local-item-fries' THEN 650 WHEN 'local-item-salad' THEN 750 WHEN 'local-item-burger' THEN 1450 ELSE 250 END,
    allergy_note=CASE WHEN id='local-item-burger' THEN 'Contains gluten and dairy.' ELSE NULL END,
    position=CASE id WHEN 'local-item-fries' THEN 0 WHEN 'local-item-salad' THEN 1 WHEN 'local-item-burger' THEN 0 ELSE 9 END,
    enabled=1, archived=0
WHERE id IN ('local-item-fries','local-item-salad','local-item-burger','local-item-water');

UPDATE menu_items SET image_url=CASE id
  WHEN 'local-item-burger' THEN '/menu/menyue-burger.png'
  WHEN 'local-item-salad' THEN '/menu/garden-salad.png'
  WHEN 'local-item-water' THEN '/menu/island-water.png'
  WHEN 'local-item-fries' THEN '/menu/mas-huni.png'
  ELSE image_url END,
  dietary_labels=CASE WHEN id='local-item-salad' THEN 'vegetarian,vegan' WHEN id='local-item-water' THEN 'vegan' ELSE NULL END,
  tags=CASE WHEN id='local-item-burger' THEN 'popular,grill' WHEN id='local-item-water' THEN 'drink,refreshing' ELSE NULL END
WHERE id IN ('local-item-burger','local-item-salad','local-item-water','local-item-fries');

INSERT INTO media_assets(id,restaurant_id,r2_key,content_type,bytes,sha256,state)
VALUES (${sqlString(UPLOADED_MENU_ASSET.id)},'demo',${sqlString(UPLOADED_MENU_ASSET.key)},${sqlString(UPLOADED_MENU_ASSET.contentType)},${uploadedMenuBytes.length},${sqlString(uploadedMenuHash)},'active')
ON CONFLICT(id) DO UPDATE SET restaurant_id=excluded.restaurant_id,r2_key=excluded.r2_key,content_type=excluded.content_type,bytes=excluded.bytes,sha256=excluded.sha256,state='active';
UPDATE menu_items SET photo_asset_id=${sqlString(UPLOADED_MENU_ASSET.id)} WHERE id='local-item-fries';

WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
INSERT OR IGNORE INTO menu_items(id,category_id,code,name,description,base_price_minor,allergy_note,position,enabled)
SELECT 'fixture-item-' || x, CASE WHEN x % 5 = 0 THEN 'local-category-drinks' WHEN x % 2 = 0 THEN 'local-category-starters' ELSE 'local-category-mains' END,
  'FIX' || printf('%03d',x), CASE WHEN x % 5 = 0 THEN 'House drink ' || x ELSE 'House dish ' || x END,
  'A deliberately detailed fixture description for search, responsive cards and long-menu density testing. Batch ' || x || '.', 350 + x * 13,
  CASE WHEN x % 9 = 0 THEN 'May contain nuts.' ELSE NULL END, 20+x, 1 FROM n;
UPDATE menu_items
SET category_id=CASE WHEN CAST(substr(id,14) AS INTEGER) % 5 = 0 THEN 'local-category-drinks' WHEN CAST(substr(id,14) AS INTEGER) % 2 = 0 THEN 'local-category-starters' ELSE 'local-category-mains' END,
    code='FIX' || printf('%03d', CAST(substr(id,14) AS INTEGER)),
    name=CASE WHEN CAST(substr(id,14) AS INTEGER) % 5 = 0 THEN 'House drink ' || CAST(substr(id,14) AS INTEGER) ELSE 'House dish ' || CAST(substr(id,14) AS INTEGER) END,
    description='A deliberately detailed fixture description for search, responsive cards and long-menu density testing. Batch ' || CAST(substr(id,14) AS INTEGER) || '.',
    base_price_minor=350 + CAST(substr(id,14) AS INTEGER) * 13,
    allergy_note=CASE WHEN CAST(substr(id,14) AS INTEGER) % 9 = 0 THEN 'May contain nuts.' ELSE NULL END,
    position=20 + CAST(substr(id,14) AS INTEGER), enabled=1, archived=0
WHERE id GLOB 'fixture-item-[0-9]*' AND CAST(substr(id,14) AS INTEGER) BETWEEN 1 AND 100;
UPDATE menu_items SET image_url='/menu/reef-fish-curry.png',dietary_labels='pescatarian',tags='island,spiced' WHERE id='fixture-item-1';

INSERT OR IGNORE INTO item_allergens(item_id, allergen_id, severity)
VALUES ('local-item-burger', 'gluten', 'contains'), ('local-item-burger', 'dairy', 'contains');
UPDATE item_allergens SET severity='contains' WHERE item_id='local-item-burger' AND allergen_id IN ('gluten','dairy');

INSERT OR IGNORE INTO item_promotions(id, item_id, label, description, price_minor, enabled, position)
VALUES ('local-promo-burger', 'local-item-burger', 'Lunch offer', 'Available in the demo menu.', 1250, 1, 0);
UPDATE item_promotions SET item_id='local-item-burger',label='Lunch offer',description='Available in the demo menu.',price_minor=1250,starts_at=NULL,ends_at=NULL,enabled=1,position=0 WHERE id='local-promo-burger';

INSERT OR IGNORE INTO combo_groups(id, item_id, name, min_choices, max_choices, position, enabled)
VALUES ('local-combo-side', 'local-item-burger', 'Choose a side', 1, 1, 0, 1);
UPDATE combo_groups SET item_id='local-item-burger',name='Choose a side',min_choices=1,max_choices=1,position=0,enabled=1 WHERE id='local-combo-side';
INSERT OR IGNORE INTO combo_choices(id, group_id, code, name, price_delta_minor, position, enabled)
VALUES
  ('local-choice-fries', 'local-combo-side', 'FRIES', 'Seasoned fries', 0, 0, 1),
  ('local-choice-salad', 'local-combo-side', 'SALAD', 'Garden salad', 150, 1, 1);
UPDATE combo_choices SET is_default=1 WHERE id='local-choice-fries';
UPDATE combo_choices SET group_id='local-combo-side',code='FRIES',name='Seasoned fries',price_delta_minor=50,position=0,enabled=1,is_default=1 WHERE id='local-choice-fries';
UPDATE combo_choices SET group_id='local-combo-side',code='SALAD',name='Garden salad',price_delta_minor=150,position=1,enabled=1,is_default=0 WHERE id='local-choice-salad';

INSERT OR IGNORE INTO item_suggestions(restaurant_id,item_id,suggested_item_id,position,enabled)
VALUES ('demo','local-item-burger','local-item-water',0,1),('demo','local-item-salad','local-item-water',0,1);
UPDATE item_suggestions SET restaurant_id='demo',position=0,enabled=1 WHERE item_id IN ('local-item-burger','local-item-salad') AND suggested_item_id='local-item-water';
INSERT OR IGNORE INTO combo_groups(id,item_id,name,min_choices,max_choices,position,enabled)
VALUES ('local-combo-water','local-item-water','Water service',1,1,0,1);
UPDATE combo_groups SET item_id='local-item-water',name='Water service',min_choices=1,max_choices=1,position=0,enabled=1 WHERE id='local-combo-water';
INSERT OR IGNORE INTO combo_choices(id,group_id,code,name,price_delta_minor,position,enabled,is_default)
VALUES ('local-choice-water-chilled','local-combo-water','CHILLED','Chilled',0,0,1,1),('local-choice-water-room','local-combo-water','ROOM','Room temperature',0,1,1,0);
UPDATE combo_choices SET group_id='local-combo-water',code='CHILLED',name='Chilled',price_delta_minor=0,position=0,enabled=1,is_default=1 WHERE id='local-choice-water-chilled';
UPDATE combo_choices SET group_id='local-combo-water',code='ROOM',name='Room temperature',price_delta_minor=0,position=1,enabled=1,is_default=0 WHERE id='local-choice-water-room';

UPDATE restaurant_currencies SET is_base=0 WHERE restaurant_id='demo';
DELETE FROM restaurant_currencies WHERE restaurant_id='demo' AND currency_code='MVR';
DELETE FROM currency_rate_sync WHERE restaurant_id='demo';
INSERT OR REPLACE INTO restaurant_currencies(restaurant_id,currency_code,minor_unit,locale,enabled,is_base,rate_mode,fixed_numerator,fixed_denominator)
VALUES ('demo','USD',2,'en-US',1,1,'fixed',NULL,NULL),('demo','EUR',2,'en-IE',1,0,'fixed','23','25'),('demo','GBP',2,'en-GB',1,0,'api','4','5');
INSERT OR REPLACE INTO currency_rate_sync(restaurant_id,base_currency,quote_currency,numerator,denominator,source,fetched_at,expires_at,lease_until)
VALUES ('demo','USD','GBP','4','5','exchange-rate-api',unixepoch(),unixepoch()+86400,NULL);

INSERT OR IGNORE INTO dining_tables(id, restaurant_id, label, token_hash, token_hint, enabled)
VALUES ('local-table-one', 'demo', 'Table 1', ${sqlString(tableHash)}, 'e-local', 1);
${
	repairExistingTable
		? `
UPDATE dining_tables
SET restaurant_id='demo', label='Table 1', token_hash=${sqlString(tableHash)}, token_hint='e-local', enabled=1
WHERE id='local-table-one';
`
		: ''
}

INSERT OR IGNORE INTO beverage_prompt_settings(restaurant_id,enabled,heading,body,skip_label)
VALUES ('demo',1,'Something to drink?','A chilled lime water is a lovely match for your meal.','No thanks, send order')
ON CONFLICT(restaurant_id) DO UPDATE SET enabled=1,heading=excluded.heading,body=excluded.body,skip_label=excluded.skip_label;
INSERT OR IGNORE INTO beverage_prompt_items(restaurant_id,item_id) VALUES ('demo','local-item-water');
INSERT OR IGNORE INTO beverage_prompt_categories(restaurant_id,category_id) VALUES ('demo','local-category-drinks');
`;

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'menyue-local-seed-'));
const seedFile = join(temporaryDirectory, 'seed.sql');
writeFileSync(seedFile, seedSql, { encoding: 'utf8', mode: 0o600 });
try {
	runWrangler([
		'd1',
		'execute',
		'menyue',
		'--local',
		'--persist-to',
		stateDirectory,
		'--file',
		seedFile,
	]);
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`\nLocal environment ready:
  Menu:    http://localhost:5173/
  Table:   http://localhost:5173/t/${TABLE_TOKEN}
  Admin:   http://localhost:5173/admin/login
           ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}
  Manager: ${MANAGER_USERNAME} / ${MANAGER_PASSWORD}
  Counter: http://localhost:5173/counter/login
           ${COUNTER_PASSWORD}\n`);
