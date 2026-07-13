import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [320, 375, 390, 412, 768] as const;

async function expectContained(page: Page, locator: Locator) {
	await expect.poll(async () => {
		const [box, viewport] = await Promise.all([
			locator.boundingBox(),
			page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
		]);
		return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
	}).toBe(true);
}

test('table menu follows OS themes across the customer viewport matrix', async ({ page }, testInfo) => {
	for (const colorScheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme });
		for (const width of viewports) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/t/table-one-local');
			const shell = page.locator('.table-shell');
			const sidebar = page.locator('.customer-menu-sidebar');
			const visibleCurrencies = page.locator('[data-testid^="currency-selector"]:visible');
			await expect(shell).toBeVisible();
			await expect(sidebar).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

			if (width < 768) await expect(visibleCurrencies).toHaveCount(1);
			await expectContained(page, sidebar);
			await page.screenshot({ path: testInfo.outputPath(`table-${colorScheme}-${width}.png`), fullPage: false });
		}
	}

	await page.emulateMedia({ colorScheme: 'dark' });
	await page.setViewportSize({ width: 320, height: 900 });
	await page.goto('/t/table-one-local');
	const shell = page.locator('.table-shell');
	await expect.poll(() => shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--background'))).not.toBe('');
	await page.getByTestId('add-local-item-burger').click();
	const dialog = page.getByTestId('order-draft');
	await expect(dialog).toBeVisible();
	await expectContained(page, dialog);
	await dialog.screenshot({ path: testInfo.outputPath('table-dark-320-add-dialog.png') });
});
