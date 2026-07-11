import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('administrator can reach settings and users', async ({ page }) => {
	await login(page, 'admin');
	await page.goto('/admin/settings');
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await expect(page.getByText('Exchange rate status')).toBeVisible();
	await page.goto('/admin/users');
	await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
});

test('manager can edit the menu but is 403 from admin-only pages', async ({ page }) => {
	await login(page, 'manager');

	await page.goto('/admin/menu');
	await expect(page.getByRole('heading', { name: 'Menu items' })).toBeVisible();

	const settings = await page.goto('/admin/settings');
	expect(settings?.status()).toBe(403);
	await expect(page.getByText('403')).toBeVisible();

	const users = await page.goto('/admin/users');
	expect(users?.status()).toBe(403);
});

test('manager mutation endpoints are protected server-side', async ({ page }) => {
	await login(page, 'manager');
	// page.request shares the manager session cookie. An admin-only settings
	// action must be rejected with a genuine 403.
	const res = await page.request.post('/admin/settings?/saveGeneral', {
		form: { baseCode: 'XXX', baseSymbol: 'X', basePrecision: '2', basePosition: 'before' },
		headers: { origin: new URL(page.url()).origin }
	});
	expect(res.status()).toBe(403);
});
