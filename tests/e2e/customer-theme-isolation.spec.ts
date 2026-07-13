import { expect, test } from '@playwright/test';

test('customer menu follows the OS scheme and keeps an accessible focus token', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/t/table-one-local');
	const shell = page.locator('.table-shell');
	await expect(shell).toBeVisible();
	const light = await shell.evaluate((element) => ({
		background: getComputedStyle(element).getPropertyValue('--background'),
		foreground: getComputedStyle(element).getPropertyValue('--foreground'),
		focus: getComputedStyle(element).getPropertyValue('--customer-focus'),
	}));
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--background'))).not.toBe(light.background);
	expect(await shell.evaluate((element) => ({
		background: getComputedStyle(element).getPropertyValue('--background'),
		foreground: getComputedStyle(element).getPropertyValue('--foreground'),
		focus: getComputedStyle(element).getPropertyValue('--customer-focus'),
	}))).toMatchObject({ focus: 'rgb(255, 255, 255)' });
});
