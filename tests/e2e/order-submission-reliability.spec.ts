import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const token = 'table-one-local';
const tableId = 'local-table-one';
const localState = '.wrangler/state';
const usedKeys = new Set<string>();
let sequenceBeforeTest = 1;

function localOnly(testInfo: TestInfo) {
	return new URL(testInfo.project.use.baseURL ?? process.env.BASE_URL ?? 'http://localhost:5173').hostname === 'localhost';
}

function d1(sql: string): Array<Record<string, unknown>> {
	const output = execFileSync(
		process.execPath,
		[
			resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'menyue', '--local', '--persist-to', localState,
			'--command', sql, '--json',
		],
		{ cwd: process.cwd(), encoding: 'utf8', shell: false },
	);
	return JSON.parse(output)[0]?.results ?? [];
}

function sqlKeys() {
	return [...usedKeys].map((key) => `'${key}'`).join(',');
}

test.beforeEach(async ({ browserName: _browserName }, testInfo) => {
	test.skip(!localOnly(testInfo), 'This reliability fixture intentionally verifies and restores local D1 state.');
	usedKeys.clear();
	sequenceBeforeTest = Number(d1("SELECT next_number FROM order_sequences WHERE restaurant_id='demo'")[0]?.next_number ?? 1);
});

test.afterEach(async () => {
	if (!usedKeys.size) return;
	const keys = sqlKeys();
	d1(`DELETE FROM order_line_choices WHERE line_id IN (SELECT id FROM order_lines WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys})));
DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys}));
DELETE FROM order_lines WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys}));
DELETE FROM order_money_snapshots WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys}));
DELETE FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys});
UPDATE order_sequences SET next_number=${sequenceBeforeTest} WHERE restaurant_id='demo';`);
});

const fries = { itemId: 'local-item-fries', quantity: 1, choiceIds: [] };

async function postOrder(page: Page, idempotencyKey: string, lines = [fries]) {
	usedKeys.add(idempotencyKey);
	return page.request.post(`/api/tables/${token}/orders`, { data: { idempotencyKey, lines } });
}

async function addFries(page: Page) {
	await page.goto(`/t/${token}`);
	await page.waitForTimeout(250);
	await page.getByTestId('add-local-item-fries').click();
	await expect(page.getByTestId('draft-commit')).toBeVisible();
	await page.getByTestId('draft-commit').click();
}

async function submitPastBeverage(page: Page) {
	if (!(await page.getByTestId('beverage-prompt').isVisible()))
		await page.getByTestId('submit-order').click();
	await page.getByTestId('beverage-skip').click();
}

test('desktop API replays identical keys, recovers concurrent races, and records one event', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'API race proof is covered once at desktop.');
	const key = crypto.randomUUID();
	const first = await postOrder(page, key);
	const firstBody = await first.json() as { order: { id: string }; nextIdempotencyKey: string };
	expect(first.status()).toBe(200);
	const replay = await postOrder(page, key);
	const replayBody = await replay.json() as { order: { id: string }; idempotent: boolean };
	expect(replay.status()).toBe(200);
	expect(replayBody).toMatchObject({ order: { id: firstBody.order.id }, idempotent: true });
	const counts = d1(`SELECT
  (SELECT count(*) FROM orders WHERE id='${firstBody.order.id}') AS orders,
  (SELECT count(*) FROM order_lines WHERE order_id='${firstBody.order.id}') AS lines,
  (SELECT count(*) FROM order_events WHERE order_id='${firstBody.order.id}' AND type='order.created') AS events`)[0];
	expect(counts).toEqual({ orders: 1, lines: 1, events: 1 });
	const distinct = await postOrder(page, firstBody.nextIdempotencyKey);
	const distinctBody = await distinct.json() as { order: { id: string } };
	expect(distinct.status()).toBe(200);
	expect(distinctBody.order.id).not.toBe(firstBody.order.id);

	const raceKey = crypto.randomUUID();
	const [a, b] = await Promise.all([postOrder(page, raceKey), postOrder(page, raceKey)]);
	const [aBody, bBody] = await Promise.all([a.json(), b.json()]) as Array<{ order: { id: string } }>;
	expect([a.status(), b.status()]).toEqual([200, 200]);
	expect(aBody.order.id).toBe(bBody.order.id);
	const raceCount = d1(`SELECT count(*) AS orders FROM orders WHERE table_id='${tableId}' AND idempotency_key='${raceKey}'`)[0];
	expect(raceCount).toEqual({ orders: 1 });

	const conflict = await postOrder(page, key, [{ ...fries, quantity: 2 }]);
	expect(conflict.status()).toBe(409);
	expect((await conflict.json()) as { message: string }).toMatchObject({ message: expect.stringContaining('different order') });
});

test('mobile retries retain cart and key across pre- and post-commit transport loss', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'Transport recovery is covered once at mobile.');
	await addFries(page);
	let preCommitKey = '';
	await page.route(`**/api/tables/${token}/orders`, async (route) => {
		preCommitKey = String((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
		usedKeys.add(preCommitKey);
		await route.abort('failed');
	}, { times: 1 });
	await submitPastBeverage(page);
	await expect(page.getByText('Your order is still safe to retry.')).toBeVisible();
	expect(d1(`SELECT count(*) AS orders FROM orders WHERE table_id='${tableId}' AND idempotency_key='${preCommitKey}'`)[0]).toEqual({ orders: 0 });
	const preRetry = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/tables/${token}/orders`));
	await submitPastBeverage(page);
	const preRetryResponse = await preRetry;
	expect(String((preRetryResponse.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey)).toBe(preCommitKey);
	expect(preRetryResponse.status()).toBe(200);
	await expect(page.getByRole('dialog', { name: /thank you/i })).toBeVisible();

	await page.getByRole('button', { name: /continue browsing/i }).click();
	await addFries(page);
	let postCommitKey = '';
	await page.route(`**/api/tables/${token}/orders`, async (route) => {
		postCommitKey = String((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
		usedKeys.add(postCommitKey);
		const response = await route.fetch();
		expect(response.status()).toBe(200);
		await route.abort('failed');
	}, { times: 1 });
	await submitPastBeverage(page);
	await expect(page.getByText('Your order is still safe to retry.')).toBeVisible();
	expect(d1(`SELECT count(*) AS orders FROM orders WHERE table_id='${tableId}' AND idempotency_key='${postCommitKey}'`)[0]).toEqual({ orders: 1 });
	const postRetry = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/tables/${token}/orders`));
	await submitPastBeverage(page);
	const postRetryResponse = await postRetry;
	expect(String((postRetryResponse.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey)).toBe(postCommitKey);
	expect(postRetryResponse.status()).toBe(200);
	const postRetryBody = await postRetryResponse.json() as { idempotent?: boolean; nextIdempotencyKey: string };
	expect(postRetryBody.idempotent).toBe(true);
	expect(postRetryBody.nextIdempotencyKey).not.toBe(postCommitKey);

	await page.getByRole('button', { name: /continue browsing/i }).click();
	await addFries(page);
	let conflictKey = '';
	let conflictRequests = 0;
	await page.route(`**/api/tables/${token}/orders`, async (route) => {
		conflictRequests += 1;
		conflictKey = String((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
		usedKeys.add(conflictKey);
		await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'A dish changed; refresh.' }) });
	}, { times: 1 });
	await submitPastBeverage(page);
	await expect(page.getByText('A dish changed; refresh. Your cart is still ready to submit.')).toBeVisible();
	await expect(page.getByTestId('cart-open')).toContainText('1 dish');
	await page.waitForTimeout(300);
	expect(conflictRequests).toBe(1);
	const conflictRetry = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/tables/${token}/orders`));
	await submitPastBeverage(page);
	const conflictRetryResponse = await conflictRetry;
	expect(String((conflictRetryResponse.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey)).toBe(conflictKey);
	expect(conflictRetryResponse.status()).toBe(200);

	await page.getByRole('button', { name: /continue browsing/i }).click();
	await addFries(page);
	let doubleKey = '';
	let doubleRequests = 0;
	await page.route(`**/api/tables/${token}/orders`, async (route) => {
		doubleRequests += 1;
		doubleKey = String((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
		usedKeys.add(doubleKey);
		await route.continue();
	}, { times: 2 });
	const doubleResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/tables/${token}/orders`));
	await page.getByTestId('submit-order').click();
	await page.getByTestId('beverage-skip').evaluate((button) => {
		(button as HTMLButtonElement).click();
		(button as HTMLButtonElement).click();
	});
	await doubleResponse;
	await page.waitForTimeout(100);
	expect(doubleRequests).toBe(1);
	expect(d1(`SELECT count(*) AS orders FROM orders WHERE table_id='${tableId}' AND idempotency_key='${doubleKey}'`)[0]).toEqual({ orders: 1 });
});
