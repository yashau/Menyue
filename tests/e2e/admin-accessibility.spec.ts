import { expect, test, type Page } from '@playwright/test';

const credentials = { username: 'admin', password: 'menyue-admin-local' };

async function signIn(page: Page, viewport: { width: number; height: number }) {
	await page.setViewportSize(viewport);
	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(credentials.username);
	await page.getByLabel('Password').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

test('admin exposes keyboard landmarks and an operable mobile sidebar at 320px', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'The modal sidebar is only present in the mobile browser project.');
	await signIn(page, { width: 320, height: 720 });
	await page.waitForTimeout(300);
	await expect(page.getByRole('heading', { name: 'Welcome, admin', level: 1 })).toBeVisible();

	await page.keyboard.press('Tab');
	const skipLink = page.getByRole('link', { name: 'Skip to main content' });
	await expect(skipLink).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('#admin-main')).toBeFocused();
	await expect(page.locator('main#admin-main')).toHaveCount(1);

	const trigger = page.getByRole('button', { name: /toggle sidebar/i });
	await trigger.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('Menyue admin');
	await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toHaveCount(1);
	await expect
		.poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
		.toBe(true);
	await dialog.focus();
	await expect(dialog).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});

test('admin exposes labelled form controls and keyboard-selectable menu category at 768px', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'This representative desktop-width check runs once.');
	await signIn(page, { width: 768, height: 1024 });
	await page.goto('/admin/menu/items');
	await expect(page.getByRole('heading', { name: 'Menu items', level: 1 })).toBeVisible();

	const category = page.getByRole('button', { name: 'Category' }).first();
	await expect(category).toBeVisible();
	await category.focus();
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('listbox')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(category).toBeFocused();
});

test('admin labels settings controls and makes base currency a confirmed action at 1440px', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'This representative desktop-width check runs once.');
	await signIn(page, { width: 1440, height: 900 });
	await page.goto('/admin/settings');
	await expect(page.getByRole('heading', { name: 'Currency & display', level: 1 })).toBeVisible();

	const baseCurrency = page.getByLabel('Base currency');
	await expect(baseCurrency).toHaveAttribute('aria-describedby', 'baseCurrency-description');
	await expect(baseCurrency).toHaveAttribute('readonly', '');
	await expect(page.locator('#baseCurrency-description')).toContainText('Managed by the confirmed Make base action');
	await expect(page.getByLabel('Currency code')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Rate source' })).toBeVisible();
});
