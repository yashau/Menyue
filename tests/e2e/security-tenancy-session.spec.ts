import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const state = resolve(root, '.wrangler/state');
const foreign = {
	restaurant: 'security-foreign-restaurant',
	category: 'security-foreign-category',
	item: 'security-foreign-item',
	suggestedItem: 'security-foreign-suggested-item',
	group: 'security-foreign-group',
	choice: 'security-foreign-choice',
	table: 'security-foreign-table',
	asset: 'security-foreign-media',
	key: 'security-tests/foreign-media.png',
	token: 'security-foreign-table-token',
};
const twoAdmin = { id: 'security-second-admin', username: 'security-second-admin' };
const admin = { username: 'admin', password: 'menyue-admin-local' };

const sqlString = (value: string | number | null) =>
	value === null
		? 'NULL'
		: typeof value === 'number'
			? String(value)
			: `'${value.replaceAll("'", "''")}'`;

function d1(command: string): Record<string, unknown>[] {
	const result = JSON.parse(
		execFileSync(
			process.execPath,
			[
				wrangler,
				'd1',
				'execute',
				'menyue',
				'--local',
				'--persist-to',
				state,
				'--command',
				command,
				'--json',
			],
			{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false },
		),
	);
	if (!result[0]?.success) throw new Error(`D1 command failed: ${command}`);
	return result[0].results as Record<string, unknown>[];
}

function r2(args: string[]) {
	execFileSync(
		process.execPath,
		[wrangler, 'r2', 'object', ...args, '--local', '--persist-to', state],
		{
			cwd: root,
			stdio: 'inherit',
			shell: false,
		},
	);
}

const scalar = (command: string, column: string) => d1(command)[0]?.[column];
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');

async function signIn(page: Page, credentials = admin) {
	await page.goto('/admin/login');
	await page.locator('[name="username"]').fill(credentials.username);
	await page.locator('[name="password"]').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

async function signInCounter(page: Page, username: string, password: string) {
	await page.goto('/counter/login');
	await page.locator('[name="username"]').fill(username);
	await page.locator('[name="password"]').fill(password);
	await page.getByRole('button', { name: /open board/i }).click();
	await expect(page).toHaveURL(/\/counter$/);
}

async function actionResult(
	page: Page,
	path: string,
	values: Record<string, string>,
	file?: { name: string; type: string; base64: string },
) {
	return page.evaluate(
		async ({ path, values, file }) => {
			const csrf = document.cookie
				.split('; ')
				.find((value) => value.startsWith('menyue_csrf='))
				?.split('=')[1];
			const form = new FormData();
			for (const [key, value] of Object.entries(values)) form.append(key, value);
			if (file) {
				const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
				form.append('photo', new File([bytes], file.name, { type: file.type }));
			}
			const response = await fetch(path, {
				method: 'POST',
				headers: {
					'x-csrf-token': decodeURIComponent(csrf ?? ''),
					'x-sveltekit-action': 'true',
				},
				body: form,
			});
			return { status: response.status, body: await response.text() };
		},
		{ path, values, file },
	);
}

async function action(
	page: Page,
	path: string,
	values: Record<string, string>,
	file?: { name: string; type: string; base64: string },
) {
	return (await actionResult(page, path, values, file)).status;
}

async function signedInPage(browser: Browser, credentials = admin) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, credentials);
	return { context, page };
}

function createForeignFixture() {
	const tableHash = hash(foreign.token);
	d1(`
INSERT INTO restaurants(id) VALUES(${sqlString(foreign.restaurant)});
INSERT INTO site_content(restaurant_id,title,description,cta_label,cta_url,hero_asset_id)
VALUES(${sqlString(foreign.restaurant)},'Foreign hero','Must not be changed','Foreign CTA','/foreign',${sqlString(foreign.asset)});
INSERT INTO menu_categories(id,restaurant_id,code,name,position)
VALUES(${sqlString(foreign.category)},${sqlString(foreign.restaurant)},'FOREIGN','Foreign category',0);
INSERT INTO menu_items(id,category_id,code,name,description,base_price_minor,position)
VALUES(${sqlString(foreign.item)},${sqlString(foreign.category)},'FOREIGN-ITEM','Foreign item','Must not be changed',1234,0),
(${sqlString(foreign.suggestedItem)},${sqlString(foreign.category)},'FOREIGN-SUGGESTED','Foreign suggested item','Must not be changed',4321,1);
INSERT INTO combo_groups(id,item_id,name,min_choices,max_choices,position)
VALUES(${sqlString(foreign.group)},${sqlString(foreign.item)},'Foreign modifier group',0,1,0);
INSERT INTO combo_choices(id,group_id,code,name,price_delta_minor,position)
VALUES(${sqlString(foreign.choice)},${sqlString(foreign.group)},'FOREIGN-CHOICE','Foreign choice',0,0);
INSERT INTO dining_tables(id,restaurant_id,label,token_hash,token_hint)
VALUES(${sqlString(foreign.table)},${sqlString(foreign.restaurant)},'Foreign Table',${sqlString(tableHash)},'foreign');
INSERT INTO media_assets(id,restaurant_id,r2_key,content_type,bytes,sha256,state)
VALUES(${sqlString(foreign.asset)},${sqlString(foreign.restaurant)},${sqlString(foreign.key)},'image/png',1,'foreign-hash','active');
`);
	r2([
		'put',
		`menyue-media/${foreign.key}`,
		'--file',
		resolve(root, 'static/menu/mas-huni.png'),
		'--content-type',
		'image/png',
	]);
}

function removeForeignFixture() {
	d1(`
DELETE FROM sessions WHERE principal_id=${sqlString(twoAdmin.id)};
DELETE FROM combo_choices WHERE id=${sqlString(foreign.choice)};
DELETE FROM combo_groups WHERE id=${sqlString(foreign.group)};
DELETE FROM menu_items WHERE id IN (${sqlString(foreign.item)},${sqlString(foreign.suggestedItem)});
DELETE FROM dining_tables WHERE id=${sqlString(foreign.table)};
DELETE FROM media_assets WHERE id=${sqlString(foreign.asset)};
DELETE FROM menu_categories WHERE id=${sqlString(foreign.category)};
DELETE FROM site_content WHERE restaurant_id=${sqlString(foreign.restaurant)};
DELETE FROM restaurants WHERE id=${sqlString(foreign.restaurant)};
DELETE FROM users WHERE id=${sqlString(twoAdmin.id)};
`);
	try {
		r2(['delete', `menyue-media/${foreign.key}`]);
	} catch {
		// It may not have been written if fixture setup failed before R2 initialization.
	}
}

test.describe('security session and restaurant boundaries', () => {
	test.describe.configure({ mode: 'serial' });
	test.beforeEach(async ({ browserName: _browserName }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'desktop',
			'The shared local D1 fixture is exercised once.',
		);
	});

	test('rejects and removes a browser session after its auth version changes', async ({ page }) => {
		await signIn(page);
		const session = (await page.context().cookies()).find(
			(cookie) => cookie.name === 'menyue_session',
		);
		expect(session).toBeDefined();
		const sessionHash = hash(session!.value);
		const original = d1("SELECT auth_version FROM users WHERE id='local-admin'")[0];
		try {
			d1("UPDATE users SET auth_version=auth_version+1 WHERE id='local-admin'");
			const rejected = page.waitForResponse(
				(response) =>
					new URL(response.url()).pathname === '/admin/menu/items' && response.status() === 303,
			);
			await page.goto('/admin/menu/items');
			await rejected;
			await expect(page).toHaveURL(/\/admin\/login/);
			expect(
				(await page.context().cookies()).find((cookie) => cookie.name === 'menyue_session'),
			).toBeUndefined();
			expect(
				scalar(
					`SELECT COUNT(*) AS count FROM sessions WHERE token_hash=${sqlString(sessionHash)}`,
					'count',
				),
			).toBe(0);
		} finally {
			d1(
				`UPDATE users SET auth_version=${sqlString(Number(original.auth_version))} WHERE id='local-admin'; DELETE FROM sessions WHERE token_hash=${sqlString(sessionHash)};`,
			);
		}
	});

	test('admin disabling a counter operator immediately revokes its bound board session', async ({ browser, page }) => {
		const username = `security-counter-${crypto.randomUUID().slice(0, 8)}`;
		const password = 'security-counter-password';
		let operatorId = '';
		const counterContext = await browser.newContext();
		try {
			await signIn(page);
			expect(
				await action(page, '/admin/counter-operators?/create', {
					username,
					displayName: 'Security counter',
					password,
				}),
			).toBe(200);
			operatorId = String(
				scalar(
					`SELECT id FROM counter_operators WHERE restaurant_id='demo' AND normalized_username=${sqlString(username)}`,
					'id',
				),
			);
			expect(operatorId).not.toBe('undefined');
			const counterPage = await counterContext.newPage();
			await signInCounter(counterPage, username, password);
			expect((await counterPage.request.get('/api/counter/orders')).status()).toBe(200);
			expect(
				await action(page, '/admin/counter-operators?/setEnabled', { id: operatorId, enabled: 'false' }),
			).toBe(200);
			await counterPage.goto('/counter');
			await expect(counterPage).toHaveURL(/\/counter\/login$/);
			expect((await counterPage.request.get('/api/counter/orders')).status()).toBe(401);
		} finally {
			await counterContext.close();
			if (operatorId)
				d1(`DELETE FROM sessions WHERE principal_id=${sqlString(operatorId)}; DELETE FROM counter_operators WHERE id=${sqlString(operatorId)};`);
		}
	});

	test('atomically preserves one enabled admin when two admin demotions race', async ({
		browser,
	}) => {
		const snapshot = d1('SELECT id,role,enabled,auth_version FROM users');
		const sessionSnapshot = d1(
			"SELECT id,token_hash,principal_type,principal_id,auth_version,csrf_hash,expires_at,absolute_expires_at,created_at FROM sessions WHERE principal_id='local-admin'",
		);
		try {
			d1(`
DELETE FROM users WHERE id=${sqlString(twoAdmin.id)};
UPDATE users SET role='manager',enabled=1,auth_version=auth_version+1 WHERE role='admin' AND id NOT IN ('local-admin',${sqlString(twoAdmin.id)});
UPDATE users SET role='admin',enabled=1,auth_version=auth_version+1 WHERE id='local-admin';
INSERT INTO users(id,username,display_name,role,password_hash,salt,iterations,enabled,must_change_password,auth_version)
SELECT ${sqlString(twoAdmin.id)},${sqlString(twoAdmin.username)},'Security second admin','admin',password_hash,salt,iterations,1,0,1 FROM users WHERE id='local-admin';
`);
			expect(
				scalar("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND enabled=1", 'count'),
			).toBe(2);
			const first = await signedInPage(browser, admin);
			const second = await signedInPage(browser, {
				username: twoAdmin.username,
				password: admin.password,
			});
			try {
				const results = await Promise.all([
					actionResult(first.page, '/admin/users?/update', { id: 'local-admin', role: 'manager' }),
					actionResult(second.page, '/admin/users?/update', { id: twoAdmin.id, role: 'manager' }),
				]);
				expect(
					scalar("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND enabled=1", 'count'),
				).toBe(1);
				expect(results.filter((result) => result.body.includes('"type":"success"'))).toHaveLength(
					1,
				);
				expect(
					results.filter(
						(result) =>
							result.body.includes('"type":"failure"') && /"status":(?:400|409)/.test(result.body),
					),
				).toHaveLength(1);
			} finally {
				await first.context.close();
				await second.context.close();
			}
		} finally {
			const restore = snapshot
				.map(
					(row) =>
						`UPDATE users SET role=${sqlString(String(row.role))},enabled=${sqlString(Number(row.enabled))},auth_version=${sqlString(Number(row.auth_version))} WHERE id=${sqlString(String(row.id))};`,
				)
				.join('\n');
			const restoreSessions = sessionSnapshot
				.map(
					(row) =>
						`INSERT INTO sessions(id,token_hash,principal_type,principal_id,auth_version,csrf_hash,expires_at,absolute_expires_at,created_at) VALUES(${[
							row.id,
							row.token_hash,
							row.principal_type,
							row.principal_id,
							Number(row.auth_version),
							row.csrf_hash,
							row.expires_at,
							row.absolute_expires_at,
							row.created_at,
						]
							.map((value) => sqlString(typeof value === 'number' ? value : String(value)))
							.join(',')});`,
				)
				.join('\n');
			d1(
				`DELETE FROM sessions WHERE principal_id IN ('local-admin',${sqlString(twoAdmin.id)}); ${restore} DELETE FROM users WHERE id=${sqlString(twoAdmin.id)}; ${restoreSessions}`,
			);
		}
	});

	test('does not expose or mutate a foreign restaurant while uploaded media is scoped to this restaurant', async ({
		page,
	}) => {
		let uploadedKey: string | undefined;
		let uploadedId: string | undefined;
		let visibleBefore: Record<string, unknown>[] = [];
		const uploadCode = `SECURITY-UPLOAD-${crypto.randomUUID()}`;
		const archivedMoveSibling = 'archived-security-move-sibling';
		try {
			createForeignFixture();
			await signIn(page);
			await page.goto('/admin/menu/items');
			await expect(page.getByText('Foreign item', { exact: true })).toHaveCount(0);
			await page.goto('/admin/tables');
			await expect(page.getByText('Foreign Table', { exact: true })).toHaveCount(0);
			expect((await page.request.get('/api/menu')).status()).toBe(200);
			const publicMenu = await (await page.request.get('/api/menu')).text();
			expect(publicMenu).not.toContain('Foreign item');

			const before = d1(`
SELECT c.name AS category_name,i.name AS item_name,i.base_price_minor,g.name AS group_name,t.enabled,t.token_hash,s.title,s.hero_asset_id,m.restaurant_id,m.r2_key
FROM menu_categories c JOIN menu_items i ON i.category_id=c.id JOIN combo_groups g ON g.item_id=i.id
JOIN dining_tables t ON t.id=${sqlString(foreign.table)} JOIN site_content s ON s.restaurant_id=c.restaurant_id
JOIN media_assets m ON m.id=${sqlString(foreign.asset)} WHERE c.id=${sqlString(foreign.category)};
`);

			expect(
				await action(page, '/admin/menu/categories?/update', {
					id: foreign.category,
					name: 'Changed',
					description: 'Changed',
					enabled: 'on',
				}),
			).toBe(404);
			expect(
				await action(page, '/admin/menu/items?/save', {
					id: foreign.item,
					category: foreign.category,
					code: 'CHANGED',
					name: 'Changed',
					description: 'Changed',
					price: '1',
					allergy: '',
					enabled: 'on',
				}),
			).toBe(400);
			expect(
				await action(page, '/admin/menu/items?/groupEdit', {
					id: foreign.group,
					name: 'Changed',
					min: '0',
					max: '1',
					enabled: 'on',
				}),
			).toBe(400);
			expect(
				await action(page, '/admin/menu/items?/suggestion', {
					item: 'local-item-burger',
					suggested: 'local-item-water',
					position: '',
					enabled: 'on',
				}),
			).toBe(400);
			expect(
				await action(page, '/admin/menu/items?/suggestion', {
					item: foreign.item,
					suggested: foreign.suggestedItem,
					position: '0',
					enabled: 'on',
				}),
			).toBe(400);
			expect(
				await action(page, '/admin/menu/items?/move', { itemId: foreign.item, direction: 'down' }),
			).toBe(400);
			expect(await action(page, '/admin/tables?/toggle', { id: foreign.table })).toBe(404);
			expect(await action(page, '/admin/tables?/rotate', { id: foreign.table })).toBe(404);

			expect(
				await action(page, '/admin/menu/items?/suggestion', {
					item: 'local-item-burger',
					suggested: 'local-item-water',
					position: '-1',
					enabled: 'on',
				}),
			).toBe(400);
			expect(
				await action(page, '/admin/menu/items?/suggestion', {
					item: 'local-item-burger',
					suggested: 'local-item-water',
					position: '1.5',
					enabled: 'on',
				}),
			).toBe(400);
			expect(
				await action(page, '/admin/menu/items?/suggestion', {
					item: 'local-item-burger',
					suggested: 'local-item-fries',
					position: '0',
					enabled: 'on',
				}),
			).toBe(200);
			expect(
				await action(page, '/admin/menu/items?/suggestion', {
					item: 'local-item-burger',
					suggested: 'local-item-water',
					position: '999',
					enabled: 'on',
				}),
			).toBe(200);
			const canonicalSuggestions = d1(
				"SELECT suggested_item_id,position FROM item_suggestions WHERE restaurant_id='demo' AND item_id='local-item-burger' ORDER BY position,suggested_item_id",
			);
			expect(canonicalSuggestions.map((row) => Number(row.position))).toEqual(
				canonicalSuggestions.map((_, index) => index),
			);
			expect(canonicalSuggestions.map((row) => row.suggested_item_id)).toEqual([
				'local-item-fries',
				'local-item-water',
			]);

			visibleBefore = d1(
				"SELECT id,position FROM menu_items WHERE category_id='local-category-starters' AND archived=0 ORDER BY position,id",
			);
			d1(
				`INSERT INTO menu_items(id,category_id,code,name,base_price_minor,position,archived) VALUES(${sqlString(archivedMoveSibling)},'local-category-starters','ARCHIVED-MOVE-SIBLING','Archived move sibling',1,${Number(visibleBefore[0].position) + 1},1);`,
			);
			expect(
				await action(page, '/admin/menu/items?/move', {
					itemId: String(visibleBefore[0].id),
					direction: 'down',
				}),
			).toBe(200);
			const visibleAfter = d1(
				"SELECT id FROM menu_items WHERE category_id='local-category-starters' AND archived=0 ORDER BY position,id",
			);
			expect(visibleAfter.map((row) => row.id)).toEqual([visibleBefore[1].id, visibleBefore[0].id]);

			const image = readFileSync(resolve(root, 'static/menu/mas-huni.png')).toString('base64');
			expect(
				await action(
					page,
					'/admin/menu/items?/save',
					{
						category: 'local-category-starters',
						code: uploadCode,
						name: 'Security upload',
						description: 'Scoped test asset',
						price: '1.23',
						allergy: '',
						enabled: 'on',
					},
					{ name: 'security.png', type: 'image/png', base64: image },
				),
			).toBe(200);
			const upload = d1(
				`SELECT i.id,m.id AS asset_id,m.restaurant_id,m.r2_key FROM menu_items i JOIN media_assets m ON m.id=i.photo_asset_id WHERE i.code=${sqlString(uploadCode)}`,
			)[0];
			expect(upload.restaurant_id).toBe('demo');
			uploadedId = String(upload.asset_id);
			uploadedKey = String(upload.r2_key);

			const publicForeignMedia = await page.request.get(`/media/${foreign.asset}`);
			expect(publicForeignMedia.status()).toBe(200);
			expect(publicForeignMedia.headers()['content-type']).toContain('image/png');
			expect(
				d1(`
SELECT c.name AS category_name,i.name AS item_name,i.base_price_minor,g.name AS group_name,t.enabled,t.token_hash,s.title,s.hero_asset_id,m.restaurant_id,m.r2_key
FROM menu_categories c JOIN menu_items i ON i.category_id=c.id JOIN combo_groups g ON g.item_id=i.id
JOIN dining_tables t ON t.id=${sqlString(foreign.table)} JOIN site_content s ON s.restaurant_id=c.restaurant_id
JOIN media_assets m ON m.id=${sqlString(foreign.asset)} WHERE c.id=${sqlString(foreign.category)};
`),
			).toEqual(before);
		} finally {
			const uploaded = d1(
				`SELECT m.r2_key FROM menu_items i JOIN media_assets m ON m.id=i.photo_asset_id WHERE i.code=${sqlString(uploadCode)}`,
			)[0];
			if (uploaded?.r2_key) uploadedKey = String(uploaded.r2_key);
			const restoreVisiblePositions = visibleBefore
				.map(
					(row) =>
						`UPDATE menu_items SET position=${sqlString(Number(row.position))} WHERE id=${sqlString(String(row.id))};`,
				)
				.join('');
			d1(
				`DELETE FROM item_suggestions WHERE restaurant_id='demo' AND item_id='local-item-burger' AND suggested_item_id='local-item-fries'; ${restoreVisiblePositions} DELETE FROM menu_items WHERE id=${sqlString(archivedMoveSibling)} OR code=${sqlString(uploadCode)}; ${uploadedId ? `DELETE FROM media_assets WHERE id=${sqlString(uploadedId)};` : ''}`,
			);
			if (uploadedKey) r2(['delete', `menyue-media/${uploadedKey}`]);
			removeForeignFixture();
		}
	});
});
