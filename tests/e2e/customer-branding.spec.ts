import { expect, test } from '@playwright/test';

test('admin has an isolated customer-brand preview at narrow and desktop widths', async ({ page }) => {
	for (const viewport of [{ width: 320, height: 720 }, { width: 1440, height: 900 }]) {
		await page.context().clearCookies();
		await page.setViewportSize(viewport);
		await page.goto('/admin/login');
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill('menyue-admin-local');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.goto('/admin/settings');
		await expect(page.getByRole('heading', { name: 'Customer branding' })).toBeVisible();
		await page.getByLabel('Primary colour').fill('#FFFFFF');
		const preview = page.getByTestId('customer-brand-preview');
		await expect(preview).toHaveCSS('--preview-primary', '#FFFFFF');
		await expect(preview).toBeVisible();
		expect(await page.locator('.admin-shell').evaluate((node) => getComputedStyle(node).getPropertyValue('--admin-brand'))).not.toBe('#FFFFFF');
	}
});
