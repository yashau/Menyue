import { expect, test, type Page } from '@playwright/test';

const credentials = { username: 'admin', password: 'menyue-admin-local' };
async function expectNoHorizontalOverflow(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => ({
				clientWidth: document.documentElement.clientWidth,
				scrollWidth: document.documentElement.scrollWidth,
			})),
		)
		.toEqual(
			await page.evaluate(() => ({
				clientWidth: document.documentElement.clientWidth,
				scrollWidth: document.documentElement.clientWidth,
			})),
		);
}

test('admin default primitives smoke', async ({ page }, testInfo) => {
	const mobile = testInfo.project.name === 'mobile';
	await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto('/admin/login');
	await page.locator('[name="username"]').fill(credentials.username);
	await page.locator('[name="password"]').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
	await expect(page.getByRole('heading', { name: 'Welcome, admin' })).toBeVisible();
	await expectNoHorizontalOverflow(page);

	if (mobile) {
		await page.waitForTimeout(300);
		await page.getByRole('button', { name: /toggle sidebar/i }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.keyboard.press('Escape');
	} else {
		await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
	}

	for (const route of [
		['/admin/menu/categories', 'Categories', 'category-create'],
		['/admin/menu/items', 'Menu items', 'item-editor'],
		['/admin/hero', 'Hero content', 'title'],
		['/admin/tables', 'Tables & QR tokens', 'label'],
		['/admin/users', 'Users & roles', 'username'],
		['/admin/settings', 'Currency & display', 'baseCurrency'],
		['/admin/change-password', 'Choose a new password', 'confirm'],
	] as const) {
		await page.goto(route[0]);
		await expect(page.getByText(route[1], { exact: true }).first()).toBeVisible();
		if (route[2] === 'category-create')
			await expect(page.getByRole('button', { name: 'Create category' })).toBeVisible();
		else if (route[2] === 'item-editor') {
			await page.getByRole('button', { name: 'Create menu item' }).click();
			await expect(page.getByRole('dialog').locator('[name="price"]')).toBeAttached();
			await page.keyboard.press('Escape');
		}
		else await expect(page.locator(`[name="${route[2]}"]`).first()).toBeAttached();
		await expectNoHorizontalOverflow(page);
	}

	expect(errors, 'uncaught browser errors').toEqual([]);
});

test('admin item modal and catalog controls do not overflow on mobile', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'Exercises the compact modal at the mobile project width.');
	await page.setViewportSize({ width: 320, height: 720 });
	await page.goto('/admin/login');
	await page.getByRole('textbox', { name: /username/i }).fill(credentials.username);
	await page.getByRole('textbox', { name: /password/i }).fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.goto('/admin/menu/items');
	await page.getByRole('button', { name: 'Create menu item' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByLabel('Static image path')).toBeVisible();
	await expect(dialog.getByLabel('Dietary labels')).toBeVisible();
	await expect(dialog.getByLabel('Search tags')).toBeVisible();
	await expectNoHorizontalOverflow(page);
	await page.keyboard.press('Escape');

	const search = page.getByLabel('Search items');
	await search.fill('not-a-real-menu-item');
	await expect(page.getByText('No menu items match these filters.')).toBeVisible();
	await expect(page.getByText('Clear search and status filters to reorder')).toBeVisible();
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect(search).toBeFocused();
	await expectNoHorizontalOverflow(page);
});
