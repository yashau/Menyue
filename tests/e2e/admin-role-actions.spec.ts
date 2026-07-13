import { expect, test, type Locator, type Page } from '@playwright/test';

const manager = { username: 'manager', password: 'menyue-manager-local' };
const admin = { username: 'admin', password: 'menyue-admin-local' };

async function signIn(page: Page, credentials: typeof admin) {
	await page.goto('/admin/login');
	await page.locator('[name="username"]').fill(credentials.username);
	await page.locator('[name="password"]').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

async function openCategoryEditor(page: Page): Promise<Locator> {
	const edit = page.getByRole('button', { name: 'Edit' }).first();
	const dialog = page.getByRole('dialog', { name: /^Edit / });
	await expect(edit).toBeVisible();
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await edit.click();
		try {
			await expect(dialog).toBeVisible({ timeout: 1_000 });
			return dialog;
		} catch {
			// The first interaction can land before a freshly navigated Svelte page hydrates.
		}
	}
	await expect(dialog).toBeVisible();
	return dialog;
}

test('admin can submit a menu mutation', async ({ page }) => {
	await signIn(page, admin);
	if ((page.viewportSize()?.width ?? 0) >= 768)
		await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
	await page.goto('/admin/menu/categories');
	const form = (await openCategoryEditor(page)).locator('form[action="?/update"]');
	const mutation = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/admin/menu/categories?/update'),
	);
	await form.getByRole('button', { name: 'Save' }).click();
	expect((await mutation).status()).toBe(200);
});

test('manager can mutate menu content but receives 403 for an admin-only settings mutation', async ({ page }) => {
	await signIn(page, manager);
	await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);

	await page.goto('/admin/menu/categories');
	const category = (await openCategoryEditor(page)).locator('form[action="?/update"]');
	const mutation = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/admin/menu/categories?/update'),
	);
	await category.getByRole('button', { name: 'Save' }).click();
	expect((await mutation).status()).toBe(200);

	const response = await page.evaluate(async () => {
		const csrf = document.cookie.split('; ').find((value) => value.startsWith('menyue_csrf='))?.split('=')[1];
		const result = await fetch('/admin/settings?/save', {
			method: 'POST',
			headers: { 'x-csrf-token': decodeURIComponent(csrf ?? '') },
			body: new URLSearchParams({ baseCurrency: 'USD', displayCurrency: 'EUR', fixedRate: '1' }),
		});
		return result.status;
	});
	expect(response).toBe(403);
});
