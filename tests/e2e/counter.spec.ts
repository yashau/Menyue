import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const token = 'table-one-local';
const tableId = 'local-table-one';
const localState = '.wrangler/state';
const createdKeys = new Set<string>();
let sequenceBefore = 1;

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

function quotedKeys() {
	return [...createdKeys].map((key) => `'${key}'`).join(',');
}

test.beforeEach(async ({ page }, testInfo) => {
	void page;
	test.skip(!localOnly(testInfo), 'Counter fixture tests intentionally restore local D1 state.');
	createdKeys.clear();
	sequenceBefore = Number(d1("SELECT next_number FROM order_sequences WHERE restaurant_id='demo'")[0]?.next_number ?? 1);
});

test.afterEach(async () => {
	if (!createdKeys.size) return;
	const keys = quotedKeys();
	d1(`DELETE FROM order_line_choices WHERE line_id IN (SELECT id FROM order_lines WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys})));
DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys}));
DELETE FROM order_lines WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys}));
DELETE FROM order_money_snapshots WHERE order_id IN (SELECT id FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys}));
DELETE FROM orders WHERE table_id='${tableId}' AND idempotency_key IN (${keys});
UPDATE order_sequences SET next_number=${sequenceBefore} WHERE restaurant_id='demo';`);
});

async function login(page: Page) {
	await page.goto('/counter/login');
	await page.locator('[name="username"]').fill('counter');
	await page.locator('[name="password"]').fill('menyue-counter-local');
	await page.getByRole('button', { name: /open board/i }).click();
	await expect(page).toHaveURL(/\/counter$/);
}

async function createDetailedOrder(page: Page, note = 'Guest is in a hurry.') {
	const idempotencyKey = crypto.randomUUID();
	createdKeys.add(idempotencyKey);
	const response = await page.request.post(`/api/tables/${token}/orders`, {
		data: {
			idempotencyKey,
			note,
			lines: [
				{ itemId: 'local-item-burger', quantity: 2, choiceIds: ['local-choice-salad'], note: 'Sauce on the side.' },
				{ itemId: 'local-item-water', quantity: 1, choiceIds: ['local-choice-water-chilled'] },
			],
		},
	});
	expect(response.status()).toBe(200);
	return (await response.json()) as { order: { id: string; displayNumber: number } };
}

async function noOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
}

test('counter login gates access and rejects invalid credentials', async ({ page }) => {
	await page.goto('/counter');
	await expect(page).toHaveURL(/\/counter\/login$/);
	await page.locator('[name="password"]').fill('wrong-password');
	await page.getByRole('button', { name: /open board/i }).click();
	await expect(page.getByRole('alert')).toHaveText('Invalid counter password.');
	await login(page);
	await expect(page.getByRole('heading', { name: 'Keep the room moving.' })).toBeVisible();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/counter\/login$/);
	expect(await page.evaluate(() => fetch('/api/counter/orders').then((response) => response.status))).toBe(401);
});

test('counter renders a detailed order, protects transitions, and recovers refresh', async ({ page }) => {
	const order = await createDetailedOrder(page);
	await login(page);
	await page.getByRole('button', { name: /refresh orders/i }).click();
	const ticket = page.getByTestId(`counter-order-${order.order.id}`);
	await expect(ticket).toContainText(`#${order.order.displayNumber}`);
	await expect(ticket).toContainText('Table 1');
	await expect(ticket).toContainText('2× Menyue burger');
	await expect(ticket).toContainText('Choose a side: Garden salad');
	await expect(ticket).toContainText('Line note: Sauce on the side.');
	await expect(ticket).toContainText('Order note');
	await expect(ticket).toContainText('Guest is in a hurry.');
	await expect(ticket).toContainText('EUR');
	await expect(ticket).toContainText('GBP');

	await ticket.getByRole('button', { name: /accept order #/i }).dblclick();
	await expect(ticket).toContainText('accepted');
	const updated = d1(`SELECT version,status FROM orders WHERE id='${order.order.id}'`)[0];
	expect(updated).toEqual({ version: 2, status: 'accepted' });
	expect(d1(`SELECT count(*) AS count FROM order_events WHERE order_id='${order.order.id}' AND type='order.status.updated'`)[0]).toEqual({ count: 1 });

	const stale = await page.evaluate(async ({ id }) => {
		const csrf = document.cookie.split('; ').find((part) => part.startsWith('menyue_csrf='))?.split('=')[1] ?? '';
		const response = await fetch(`/api/counter/orders/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ status: 'preparing', version: 1 }) });
		return { status: response.status, body: await response.json() };
	}, { id: order.order.id });
	expect(stale.status).toBe(409);
	expect(stale.body).toMatchObject({ message: expect.stringContaining('Order changed') });

	await page.route('**/api/counter/orders', (route) => route.abort('failed'));
	await page.getByRole('button', { name: /refresh orders/i }).click();
	await expect(page.locator('.counter-feedback').getByText('Couldn’t refresh orders.')).toBeVisible();
	await expect(ticket).toBeVisible();
	await page.unroute('**/api/counter/orders');
	await page.getByRole('button', { name: /refresh orders/i }).click();
	await expect(page.locator('.counter-feedback').getByText('Couldn’t refresh orders.')).toBeHidden();
});

test('counter records one event when identical same-version transitions race', async ({ page }) => {
	const order = await createDetailedOrder(page);
	await login(page);
	const results = await page.evaluate(async ({ id }) => {
		const csrf = document.cookie.split('; ').find((part) => part.startsWith('menyue_csrf='))?.split('=')[1] ?? '';
		return Promise.all([0, 1].map(async () => {
			const response = await fetch(`/api/counter/orders/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
				body: JSON.stringify({ status: 'accepted', version: 1 }),
			});
			return response.status;
		}));
	}, { id: order.order.id });
	expect(results.sort()).toEqual([200, 409]);
	expect(d1(`SELECT status,version FROM orders WHERE id='${order.order.id}'`)[0]).toEqual({ status: 'accepted', version: 2 });
	expect(d1(`SELECT count(*) AS count FROM order_events WHERE order_id='${order.order.id}' AND type='order.status.updated'`)[0]).toEqual({ count: 1 });
});

test('counter locks stale actions and focuses refresh after a confirmed mutation cannot refresh', async ({ page }) => {
	const order = await createDetailedOrder(page);
	await login(page);
	const ticket = page.getByTestId(`counter-order-${order.order.id}`);
	await page.route('**/api/counter/orders', (route) => route.abort('failed'));
	await ticket.getByRole('button', { name: `Accept order #${order.order.displayNumber}` }).click();
	const refresh = page.getByRole('button', { name: 'Refresh orders' });
	await expect(page.getByTestId('counter-connection')).toContainText('Stale');
	await expect(page.locator('.counter-feedback')).toContainText(`Order #${order.order.displayNumber} was updated, but this board snapshot is stale.`);
	await expect(refresh).toBeFocused();
	await expect(ticket.getByRole('button', { name: `Start preparing order #${order.order.displayNumber}` })).toBeDisabled();
	await page.unroute('**/api/counter/orders');
	await refresh.click();
	await expect(ticket.getByRole('button', { name: `Start preparing order #${order.order.displayNumber}` })).toBeEnabled();
});

test('counter announces each new arrival once and can open its ticket with the keyboard', async ({ page }) => {
	await login(page);
	await expect(page.getByTestId('new-order-alert')).toHaveCount(0);

	const order = await createDetailedOrder(page, 'Arrival alert note.');
	await page.getByRole('button', { name: /refresh orders/i }).click();
	const alert = page.getByTestId('new-order-alert');
	await expect(alert).toHaveCount(1);
	await expect(alert).toContainText(`New order #${order.order.displayNumber}`);
	await expect(alert).toContainText('Table 1');
	await expect(alert.getByRole('button', { name: 'Open ticket' })).toBeVisible();

	await page.getByRole('button', { name: /refresh orders/i }).click();
	await expect(page.getByTestId('new-order-alert')).toHaveCount(1);
	await alert.getByRole('button', { name: 'Open ticket' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId(`counter-order-${order.order.id}`)).toBeFocused();
});

test('counter queue and lanes actions remain reachable without horizontal overflow', async ({ page }) => {
	await createDetailedOrder(page);
	await login(page);
	await page.getByTestId('counter-view-lanes').click();
	for (const width of [320, 360, 390, 412, 768, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		await page.getByRole('button', { name: /refresh orders/i }).click();
		await expect(page.getByTestId('counter-lanes')).toBeVisible();
		await expect(page.getByRole('button', { name: /accept order #/i }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: /cancel order #/i }).first()).toBeVisible();
		await noOverflow(page);
	}
	await page.getByTestId('counter-view-queue').click();
	await expect(page.getByRole('button', { name: /accept order #/i }).first()).toBeVisible();
	await noOverflow(page);
});

test('counter lanes preserve FIFO and share filters and focus behavior with queue', async ({ page }) => {
	const oldest = await createDetailedOrder(page, 'Lane FIFO oldest.');
	const newest = await createDetailedOrder(page, 'Lane FIFO newest.');
	const accepted = await createDetailedOrder(page, 'Lane accepted.');
	d1(`UPDATE orders SET created_at=datetime('now', '-12 minutes'), updated_at=datetime('now', '-12 minutes') WHERE id='${oldest.order.id}';
UPDATE orders SET created_at=datetime('now', '-11 minutes'), updated_at=datetime('now', '-11 minutes') WHERE id='${newest.order.id}';
UPDATE orders SET status='accepted', created_at=datetime('now', '-10 minutes'), updated_at=datetime('now', '-10 minutes') WHERE id='${accepted.order.id}';`);

	await login(page);
	const lanes = page.getByTestId('counter-lanes');
	await page.getByTestId('counter-view-lanes').click();
	await expect(lanes).toBeVisible();
	await expect(page.getByTestId('counter-view-lanes')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('counter-lane-new')).toContainText('New');
	await expect(page.getByTestId('counter-lane-accepted')).toContainText('Accepted');
	await expect(page.getByTestId('counter-lane-preparing')).toContainText('No preparing orders match the current filters.');

	const newLaneOrder = await page.getByTestId('counter-lane-new').locator('[data-order-id]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-order-id')));
	expect(newLaneOrder.indexOf(oldest.order.id)).toBeLessThan(newLaneOrder.indexOf(newest.order.id));

	const search = page.getByTestId('counter-search');
	await search.fill('Lane accepted.');
	await expect(page.getByTestId(`counter-order-${accepted.order.id}`)).toBeVisible();
	await expect(page.getByTestId(`counter-order-${oldest.order.id}`)).toBeHidden();
	await expect(page.getByTestId('counter-lane-new')).toContainText('No new orders match the current filters.');
	await page.getByTestId('counter-view-queue').click();
	await expect(page.getByTestId(`counter-order-${accepted.order.id}`)).toBeVisible();
	await expect(page.getByTestId(`counter-order-${oldest.order.id}`)).toBeHidden();

	await search.fill('Lane FIFO oldest.');
	await page.getByTestId('counter-view-lanes').click();
	const oldestTicket = page.getByTestId(`counter-order-${oldest.order.id}`);
	await oldestTicket.getByRole('button', { name: `Accept order #${oldest.order.displayNumber}` }).click();
	const acceptedTicket = page.getByTestId(`counter-order-${oldest.order.id}`);
	await expect(acceptedTicket).toBeVisible();
	await expect(page.getByTestId('counter-lane-accepted').getByTestId(`counter-order-${oldest.order.id}`)).toBeVisible();
	await expect(acceptedTicket.getByRole('button', { name: `Start preparing order #${oldest.order.displayNumber}` })).toBeFocused();

	await acceptedTicket.getByRole('button', { name: `Cancel order #${oldest.order.displayNumber}` }).click();
	const dialog = page.getByRole('dialog', { name: `Cancel order #${oldest.order.displayNumber}?` });
	await expect(dialog).toBeVisible();
	await dialog.getByTestId('counter-confirm-cancel').click();
	await expect(acceptedTicket).toBeHidden();
	await expect(page.getByTestId('counter-status-cancelled')).toBeFocused();
});

test('counter cancellation confirms explicitly, restores focus, prevents duplicates, and contains its dialog', async ({ page }) => {
	const order = await createDetailedOrder(page);
	await login(page);
	const ticket = page.getByTestId(`counter-order-${order.order.id}`);
	const cancel = ticket.getByRole('button', { name: `Cancel order #${order.order.displayNumber}` });

	await cancel.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: `Cancel order #${order.order.displayNumber}?` });
	await expect(dialog).toContainText('Table 1');
	await expect(dialog).toContainText('cannot be returned to the active queue');
	expect(d1(`SELECT status FROM orders WHERE id='${order.order.id}'`)[0]).toEqual({ status: 'new' });
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(cancel).toBeFocused();

	await cancel.click();
	await expect(dialog).toBeVisible();
	await page.mouse.click(2, 2);
	await expect(dialog).toBeHidden();
	await expect(cancel).toBeFocused();

	await page.setViewportSize({ width: 320, height: 520 });
	await cancel.click();
	await expect(dialog).toBeVisible();
	expect(await dialog.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight;
	})).toBe(true);
	expect(await page.evaluate(() => window.innerWidth)).toBe(320);
	await noOverflow(page);

	let mutationRequests = 0;
	await page.route(`**/api/counter/orders/${order.order.id}`, async (route) => {
		mutationRequests += 1;
		await route.continue();
	});
	await dialog.getByTestId('counter-confirm-cancel').dblclick();
	await expect(ticket).toBeHidden();
	await expect(page.getByTestId('counter-status-cancelled')).toBeFocused();
	await expect(page.locator('.counter-feedback')).toContainText(`Order #${order.order.displayNumber} updated to cancelled is hidden by the Cancelled filter.`);
	expect(mutationRequests).toBe(1);
	expect(d1(`SELECT status FROM orders WHERE id='${order.order.id}'`)[0]).toEqual({ status: 'cancelled' });
	await page.unroute(`**/api/counter/orders/${order.order.id}`);
});

test('counter cancellation refreshes and focuses the changed ticket after a version conflict', async ({ page }) => {
	const order = await createDetailedOrder(page);
	await login(page);
	const ticket = page.getByTestId(`counter-order-${order.order.id}`);
	await ticket.getByRole('button', { name: `Cancel order #${order.order.displayNumber}` }).click();
	const dialog = page.getByRole('dialog', { name: `Cancel order #${order.order.displayNumber}?` });
	await expect(dialog).toBeVisible();
	d1(`UPDATE orders SET version=version+1 WHERE id='${order.order.id}'`);
	await dialog.getByTestId('counter-confirm-cancel').click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('.counter-feedback')).toContainText(`Order #${order.order.displayNumber} changed elsewhere.`);
	await expect(ticket.getByRole('button', { name: `Accept order #${order.order.displayNumber}` })).toBeFocused();
	expect(d1(`SELECT status FROM orders WHERE id='${order.order.id}'`)[0]).toEqual({ status: 'new' });
});

test('counter filters, search, age tiers, and closed history remain independently reachable', async ({ page }) => {
	const fresh = await createDetailedOrder(page, 'Fresh ticket note alpha.');
	const waiting = await createDetailedOrder(page, 'Waiting ticket note bravo.');
	const overdue = await createDetailedOrder(page, 'Overdue ticket note charlie.');
	const completed = await createDetailedOrder(page, 'Completed ticket note delta.');
	d1(`UPDATE orders SET status='accepted', created_at=datetime('now', '-6 minutes'), updated_at=datetime('now', '-6 minutes') WHERE id='${waiting.order.id}';
UPDATE orders SET status='ready', created_at=datetime('now', '-12 minutes'), updated_at=datetime('now', '-12 minutes') WHERE id='${overdue.order.id}';
UPDATE orders SET status='completed', created_at=datetime('now', '-15 minutes'), updated_at=datetime('now') WHERE id='${completed.order.id}';`);

	await login(page);
	await page.getByRole('button', { name: /refresh orders/i }).click();
	const statusCounts = Object.fromEntries(d1(`WITH eligible AS (
		SELECT status,updated_at,display_number FROM orders WHERE restaurant_id='demo'
		AND (status IN ('new','accepted','preparing','ready') OR (status IN ('completed','cancelled') AND updated_at >= datetime('now','-7 days')))
	), selected AS (
		SELECT status FROM eligible WHERE status IN ('new','accepted','preparing','ready')
		UNION ALL SELECT status FROM (SELECT status FROM eligible WHERE status IN ('completed','cancelled') ORDER BY updated_at DESC,display_number DESC LIMIT 100)
	) SELECT status,count(*) AS count FROM selected GROUP BY status`).map((row) => [String(row.status), Number(row.count)]));
	for (const status of ['new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']) {
		const expectedCount = statusCounts[status] ?? 0;
		await expect(page.getByTestId(`counter-status-${status}`)).toHaveAccessibleName(new RegExp(`${expectedCount} total$`));
	}

	const freshTicket = page.getByTestId(`counter-order-${fresh.order.id}`);
	const waitingTicket = page.getByTestId(`counter-order-${waiting.order.id}`);
	const overdueTicket = page.getByTestId(`counter-order-${overdue.order.id}`);
	const completedTicket = page.getByTestId(`counter-order-${completed.order.id}`);
	await expect(freshTicket.locator('[aria-label^="Fresh:"]')).toBeVisible();
	await expect(waitingTicket.locator('[aria-label^="Waiting:"]')).toBeVisible();
	await expect(overdueTicket.locator('[aria-label^="Overdue:"]')).toBeVisible();
	await expect(overdueTicket.locator('time')).toHaveAttribute('title', /\d{4}/);
	await expect(completedTicket).toBeHidden();

	const completedChip = page.getByTestId('counter-status-completed');
	await completedChip.focus();
	await page.keyboard.press('Space');
	await expect(completedChip).toHaveAttribute('aria-pressed', 'true');
	await expect(completedTicket).toBeVisible();

	const search = page.getByTestId('counter-search');
	await search.fill('Garden salad');
	await expect(freshTicket).toBeVisible();
	await expect(waitingTicket).toBeVisible();
	await search.fill('Choose a side');
	await expect(overdueTicket).toBeVisible();
	await search.fill('Sauce on the side');
	await expect(freshTicket).toBeVisible();
	await search.fill('Fresh ticket note alpha');
	await expect(freshTicket).toBeVisible();
	await expect(waitingTicket).toBeHidden();
	await search.fill('not a counter order');
	await expect(page.getByRole('heading', { name: 'No orders match that search.' })).toBeVisible();
});

test('counter exposes keyboard-operable controls and restores focus after a transition', async ({ page }) => {
	const order = await createDetailedOrder(page);
	await page.goto('/counter/login');
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'MENYUE' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.locator('[name="username"]')).toBeFocused();
	await page.keyboard.type('counter');
	await page.keyboard.press('Tab');
	await expect(page.locator('[name="password"]')).toBeFocused();
	await page.keyboard.type('menyue-counter-local');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/counter$/);

	const ticket = page.getByTestId(`counter-order-${order.order.id}`);
	await expect(ticket).toHaveAttribute('aria-busy', 'false');
	await expect(ticket.getByRole('heading', { name: `#${order.order.displayNumber}` })).toBeVisible();
	await expect(ticket.getByText('new', { exact: true })).toHaveAttribute('aria-label', 'Status: new');
	const accept = ticket.getByRole('button', { name: `Accept order #${order.order.displayNumber}` });
	await accept.focus();
	await expect(accept).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(ticket.getByRole('button', { name: `Start preparing order #${order.order.displayNumber}` })).toBeFocused();
	await expect(page.getByRole('status').filter({ hasText: `Order #${order.order.displayNumber} updated to accepted.` })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Refresh orders' })).toHaveAttribute('aria-busy', 'false');
});

test('counter preserves queue filters while pinning a moved ticket for rapid keyboard transitions', async ({ page }) => {
	const target = await createDetailedOrder(page, 'Continuity target.');
	const other = await createDetailedOrder(page, 'Continuity neighbour.');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 320, height: 520 });
	await login(page);
	await page.getByRole('button', { name: /refresh orders/i }).click();

	const targetTicket = page.getByTestId(`counter-order-${target.order.id}`);
	const otherTicket = page.getByTestId(`counter-order-${other.order.id}`);
	await targetTicket.getByRole('button', { name: `Accept order #${target.order.displayNumber}` }).focus();
	await page.keyboard.press('Enter');
	await expect(targetTicket.getByRole('button', { name: `Start preparing order #${target.order.displayNumber}` })).toBeFocused();
	await expect(targetTicket).toHaveClass(/transitioned/);
	expect(await targetTicket.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
	await noOverflow(page);

	await page.keyboard.press('Enter');
	await expect(targetTicket.getByRole('button', { name: `Mark ready order #${target.order.displayNumber}` })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(targetTicket.getByRole('button', { name: `Complete order #${target.order.displayNumber}` })).toBeFocused();
	await page.keyboard.press('Enter');

	const completedFilter = page.getByTestId('counter-status-completed');
	await expect(targetTicket).toBeHidden();
	await expect(completedFilter).toBeFocused();
	await expect(page.locator('.counter-feedback')).toContainText(`Order #${target.order.displayNumber} updated to completed is hidden by the Completed filter.`);
	expect(d1(`SELECT status FROM orders WHERE id='${target.order.id}'`)[0]).toEqual({ status: 'completed' });

	await otherTicket.getByRole('button', { name: `Accept order #${other.order.displayNumber}` }).click();
	await expect(otherTicket.getByRole('button', { name: `Start preparing order #${other.order.displayNumber}` })).toBeFocused();
});
