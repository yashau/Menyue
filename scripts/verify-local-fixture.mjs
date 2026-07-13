import { execFileSync } from 'node:child_process';
import { createHash, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDirectory = '.wrangler/local-fixture-verification';
const absoluteStateDirectory = resolve(root, stateDirectory);
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const setup = resolve(root, 'scripts/setup-local.mjs');
const pepperPath = resolve(root, '.dev.vars');

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function value(row, key) {
	return Number(row?.[key] ?? 0);
}

function runSetup(reset = false) {
	execFileSync(process.execPath, [setup, ...(reset ? ['--reset'] : [])], {
		cwd: root,
		env: { ...process.env, MENYUE_LOCAL_STATE_DIRECTORY: stateDirectory },
		stdio: 'inherit',
		shell: false,
	});
}

function query(command) {
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
	assert(result[0]?.success, 'Local D1 query failed.');
	return result[0].results;
}

function pepper() {
	const source = readFileSync(pepperPath, 'utf8');
	const match = source.match(/^AUTH_PEPPER\s*=\s*(.*)$/m);
	return match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

function passwordMatches(record, password, secret) {
	const actual = pbkdf2Sync(password + secret, record.salt, record.iterations, 32, 'sha256');
	const expected = Buffer.from(record.password_hash, 'base64url');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function assertFixture() {
	const restaurant = query(
		"SELECT currency,currency_minor_unit,currency_locale FROM restaurants WHERE id='demo'",
	)[0];
	assert(
		restaurant?.currency === 'USD' &&
			value(restaurant, 'currency_minor_unit') === 2 &&
			restaurant.currency_locale === 'en-US',
		'Demo restaurant must use USD / en-US / 2 minor units.',
	);

	const currencies = query(
		"SELECT currency_code,minor_unit,locale,enabled,is_base FROM restaurant_currencies WHERE restaurant_id='demo' ORDER BY currency_code",
	);
	assert(
		JSON.stringify(currencies) ===
			JSON.stringify([
				{ currency_code: 'EUR', minor_unit: 2, locale: 'en-IE', enabled: 1, is_base: 0 },
				{ currency_code: 'GBP', minor_unit: 2, locale: 'en-GB', enabled: 1, is_base: 0 },
				{ currency_code: 'USD', minor_unit: 2, locale: 'en-US', enabled: 1, is_base: 1 },
			]),
		`Unexpected demo currencies: ${JSON.stringify(currencies)}`,
	);
	assert(
		value(
			query(
				"SELECT count(*) AS count FROM restaurant_currencies WHERE restaurant_id='demo' AND currency_code='MVR'",
			)[0],
			'count',
		) === 0,
		'MVR must be absent from the local fixture.',
	);

	const counts = query(`SELECT
		(SELECT count(*) FROM menu_categories WHERE id IN ('local-category-starters','local-category-mains','local-category-drinks') AND enabled=1 AND archived=0) AS categories,
		(SELECT count(*) FROM menu_items WHERE id IN ('local-item-fries','local-item-salad','local-item-burger','local-item-water') AND enabled=1 AND archived=0) AS local_items,
		(SELECT count(*) FROM menu_items WHERE id GLOB 'fixture-item-[0-9]*' AND CAST(substr(id,14) AS INTEGER) BETWEEN 1 AND 100 AND enabled=1 AND archived=0) AS density_items,
		(SELECT count(*) FROM item_promotions WHERE id='local-promo-burger' AND enabled=1) AS promotions,
		(SELECT count(*) FROM combo_groups WHERE id IN ('local-combo-side','local-combo-water') AND enabled=1) AS combo_groups,
		(SELECT count(*) FROM combo_choices WHERE id IN ('local-choice-fries','local-choice-salad','local-choice-water-chilled','local-choice-water-room') AND enabled=1) AS combo_choices,
		(SELECT count(*) FROM item_suggestions WHERE restaurant_id='demo' AND item_id IN ('local-item-burger','local-item-salad') AND suggested_item_id='local-item-water' AND enabled=1) AS suggestions,
		(SELECT count(*) FROM beverage_prompt_items WHERE restaurant_id='demo' AND item_id='local-item-water') AS beverage_items,
		(SELECT count(*) FROM beverage_prompt_categories WHERE restaurant_id='demo' AND category_id='local-category-drinks') AS beverage_categories`)[0];
	for (const [capability, expected] of Object.entries({
		categories: 3,
		local_items: 4,
		density_items: 100,
		promotions: 1,
		combo_groups: 2,
		combo_choices: 4,
		suggestions: 2,
		beverage_items: 1,
		beverage_categories: 1,
	}))
		assert(
			value(counts, capability) === expected,
			`Expected ${expected} enabled ${capability}; received ${counts?.[capability]}.`,
		);
	assert(
		value(
			query(
				"SELECT count(*) AS count FROM beverage_prompt_settings WHERE restaurant_id='demo' AND enabled=1 AND heading='Something to drink?' AND body='A chilled lime water is a lovely match for your meal.' AND skip_label='No thanks, send order'",
			)[0],
			'count',
		) === 1,
		'Beverage prompt settings are incomplete.',
	);
	assert(
		value(
			query(
				"SELECT count(*) AS count FROM menu_categories WHERE id IN ('local-category-starters','local-category-mains','local-category-drinks') AND (enabled<>1 OR archived<>0) OR id IN ('local-item-fries','local-item-salad','local-item-burger','local-item-water') AND (enabled<>1 OR archived<>0) OR id GLOB 'fixture-item-[0-9]*' AND CAST(substr(id,14) AS INTEGER) BETWEEN 1 AND 100 AND (enabled<>1 OR archived<>0)",
			)[0],
			'count',
		) === 0,
		'A named fixture category or item is deliberately disabled or archived.',
	);
	assert(
		value(
			query(
				"SELECT sum((id='local-item-burger' AND image_url='/menu/menyue-burger.png') OR (id='local-item-salad' AND image_url='/menu/garden-salad.png') OR (id='local-item-water' AND image_url='/menu/island-water.png') OR (id='local-item-fries' AND image_url='/menu/mas-huni.png') OR (id='fixture-item-1' AND image_url='/menu/reef-fish-curry.png')) AS count FROM menu_items WHERE id IN ('local-item-burger','local-item-salad','local-item-water','local-item-fries','fixture-item-1')",
			)[0],
			'count',
		) === 5,
		'Representative fixture asset metadata is missing.',
	);
	const uploadedAsset = query(
		"SELECT i.photo_asset_id,m.r2_key,m.content_type FROM menu_items i JOIN media_assets m ON m.id=i.photo_asset_id WHERE i.id='local-item-fries'",
	)[0];
	assert(
		uploadedAsset?.photo_asset_id === 'local-asset-seasoned-fries' &&
			uploadedAsset.r2_key === 'fixture/seasoned-fries.png' &&
			uploadedAsset.content_type === 'image/png',
		'Representative uploaded fixture asset mapping is missing.',
	);
	for (const asset of [
		'menyue-burger.png',
		'garden-salad.png',
		'island-water.png',
		'mas-huni.png',
		'reef-fish-curry.png',
	])
		assert(existsSync(resolve(root, 'static', 'menu', asset)), `Missing fixture asset: ${asset}.`);

	const secret = pepper();
	assert(secret, 'AUTH_PEPPER is required for local fixture verification.');
	const admin = query(
		"SELECT password_hash,salt,iterations,enabled,must_change_password FROM users WHERE id='local-admin'",
	)[0];
	const counter = query(
		"SELECT password_hash,salt,iterations,enabled FROM counter_operators WHERE id='local-counter' AND restaurant_id='demo' AND normalized_username='counter'",
	)[0];
	assert(
		admin?.enabled === 1 &&
			admin?.must_change_password === 0 &&
			passwordMatches(admin, 'menyue-admin-local', secret),
		'Local admin credentials are not valid.',
	);
	assert(
		counter?.enabled === 1 && passwordMatches(counter, 'menyue-counter-local', secret),
		'Local counter credential is not valid.',
	);
	const table = query(
		"SELECT token_hash,enabled FROM dining_tables WHERE id='local-table-one' AND restaurant_id='demo' AND label='Table 1' AND token_hint='e-local'",
	)[0];
	assert(
		table?.enabled === 1 &&
			table.token_hash === createHash('sha256').update('table-one-local').digest('base64url'),
		'Local table token is not valid.',
	);
}

try {
	runSetup(true);
	assertFixture();
	query(
		"UPDATE restaurants SET currency='MVR',currency_minor_unit=0,currency_locale='dv-MV' WHERE id='demo'; UPDATE menu_categories SET enabled=0,archived=1,name='broken' WHERE id='local-category-starters'; UPDATE menu_items SET enabled=0,archived=1,name='broken' WHERE id='fixture-item-100'; UPDATE item_promotions SET enabled=0 WHERE id='local-promo-burger'; UPDATE combo_groups SET enabled=0 WHERE id='local-combo-side'; UPDATE combo_choices SET enabled=0 WHERE id='local-choice-fries'; UPDATE item_suggestions SET enabled=0 WHERE item_id='local-item-burger' AND suggested_item_id='local-item-water'; UPDATE beverage_prompt_settings SET enabled=0,heading='broken' WHERE restaurant_id='demo'; DELETE FROM restaurant_currencies WHERE restaurant_id='demo' AND currency_code='EUR'; UPDATE counter_operators SET password_hash='broken',salt='broken',iterations=1,enabled=0 WHERE id='local-counter'; UPDATE dining_tables SET token_hash='broken',enabled=0 WHERE id='local-table-one';",
	);
	runSetup();
	assertFixture();
	runSetup();
	assertFixture();
	console.log(
		'Verified deterministic local fixture: all configured menu, ordering, currency, credential, table, beverage, metadata, and density surfaces are enabled and restored across repeated setup.',
	);
} finally {
	if (existsSync(absoluteStateDirectory))
		rmSync(absoluteStateDirectory, { recursive: true, force: true });
}
