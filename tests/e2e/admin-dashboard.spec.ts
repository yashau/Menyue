import { expect, test, type Page } from '@playwright/test';

const credentials = { username: 'admin', password: 'menyue-admin-local' };
const viewports = [
	{ width: 320, height: 720 },
	{ width: 360, height: 740 },
	{ width: 390, height: 844 },
	{ width: 412, height: 915 },
	{ width: 768, height: 1024 },
	{ width: 1440, height: 900 },
] as const;

async function signIn(page: Page) {
	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(credentials.username);
	await page.getByLabel('Password').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

async function expectContained(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => ({
				clientWidth: document.documentElement.clientWidth,
				scrollWidth: document.documentElement.scrollWidth,
			})),
		)
		.toEqual({
			clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
			scrollWidth: await page.evaluate(() => document.documentElement.clientWidth),
		});
}

for (const viewport of viewports) {
	test(`admin overview is themed, linked, and contained at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ colorScheme: 'dark' });
		await signIn(page);

		await expect(page.getByRole('heading', { name: 'Welcome, admin', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Menu at a glance', level: 2 })).toBeVisible();
		await expect(page.getByRole('link', { name: /manage categories/i })).toHaveAttribute(
			'href',
			'/admin/menu/categories',
		);
		await expect(page.getByRole('link', { name: /open counter/i })).toHaveAttribute('href', '/counter');
		await expect(page.getByRole('link', { name: /tables.*manage tables/i })).toHaveAttribute(
			'href',
			'/admin/tables',
		);
		await expect(page.locator('.dashboard-metric--brand')).toBeVisible();
		await expect(page.locator('.admin-shell')).toHaveCSS('color-scheme', 'dark');
		await expectContained(page);

		await page.emulateMedia({ colorScheme: 'light' });
		await expect(page.locator('.admin-shell')).toHaveCSS('color-scheme', 'light');
		await expectContained(page);
	});
}
