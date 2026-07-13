import { expect, test, type Page } from '@playwright/test';

const admin = { username: 'admin', password: 'menyue-admin-local' };
const manager = { username: 'manager', password: 'menyue-manager-local' };

async function signInAdmin(page: Page, credentials: typeof admin) {
	await page.goto('/admin/login');
	await page.locator('[name="username"]').fill(credentials.username);
	await page.locator('[name="password"]').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

async function signInCounter(page: Page) {
	await page.goto('/counter/login');
	await page.locator('[name="username"]').fill('counter');
	await page.locator('[name="password"]').fill('menyue-counter-local');
	await page.getByRole('button', { name: /open board/i }).click();
	await expect(page).toHaveURL(/\/counter$/);
}

async function signOutAdmin(page: Page) {
	if ((await page.evaluate(() => window.innerWidth)) < 768)
		await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/admin\/login$/);
}

test('server enforces the admin, manager, counter, and public request matrix', async ({ page }) => {
	await page.goto('/admin/menu/items');
	await expect(page).toHaveURL(/\/admin\/login/);
	expect((await page.request.get('/api/counter/orders')).status()).toBe(401);
	expect((await page.request.post('/counter/logout')).status()).toBe(401);

	await signInAdmin(page, manager);
	await page.goto('/admin/hero');
	await expect(page.getByText('Hero content', { exact: true })).toBeVisible();
	const managerSettings = await page.request.get('/admin/settings');
	expect(managerSettings.status()).toBe(403);
	expect((await page.request.get('/api/counter/orders')).status()).toBe(401);
	const managerCsrf = await page.evaluate(async () =>
		fetch('/admin/menu/categories?/create', {
			method: 'POST',
			headers: { 'x-csrf-token': 'wrong-token' },
			body: new URLSearchParams({ name: 'must-not-create' }),
		}).then((response) => response.status),
	);
	expect(managerCsrf).toBe(403);
	await signOutAdmin(page);

	await signInAdmin(page, admin);
	expect((await page.request.get('/api/counter/orders')).status()).toBe(401);
	expect((await page.request.post('/counter/logout')).status()).toBe(401);
	await signOutAdmin(page);

	await signInCounter(page);
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/admin\/login/);
	expect((await page.request.get('/api/counter/orders')).status()).toBe(200);
	const counterCsrf = await page.evaluate(async () =>
		fetch('/api/counter/orders/not-a-real-order', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json', 'x-csrf-token': 'wrong-token' },
			body: JSON.stringify({ status: 'accepted', version: 1 }),
		}).then((response) => response.status),
	);
	expect(counterCsrf).toBe(403);

	await page.goto('/counter');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/counter\/login$/);
	expect((await page.request.get('/api/counter/orders')).status()).toBe(401);
});
