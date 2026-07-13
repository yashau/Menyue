import { expect, test } from '@playwright/test';

const credentials = { username: 'admin', password: 'menyue-admin-local' };

async function signIn(page: import('@playwright/test').Page) {
	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(credentials.username);
	await page.getByLabel('Password').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

test('admin exposes prepared menu-card controls and tenant currency health', async ({ page }) => {
	await signIn(page);
	await page.goto('/admin/menu/items');
	await page.getByRole('button', { name: 'Create menu item' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Prepare a menu-card image before upload.')).toBeVisible();
	await expect(dialog.getByLabel('Photo')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
	await page.keyboard.press('Escape');

	await page.goto('/admin/settings');
	await expect(page.getByRole('heading', { name: 'Currency health' })).toBeVisible();
	await expect(page.getByText(/Base: [A-Z]{3}/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Refresh API rates now' })).toBeVisible();
	await expect(page.getByText(/orders stay in the base currency/i).first()).toBeVisible();
});
