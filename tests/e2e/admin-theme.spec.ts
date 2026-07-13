import { expect, test, type Page } from '@playwright/test';

const credentials = { username: 'admin', password: 'menyue-admin-local' };
const viewports = [
	{ width: 320, height: 720 },
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
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

async function expectMode(page: Page, colorScheme: 'light' | 'dark') {
	const shell = page.locator('.admin-shell');
	await expect(shell).toBeVisible();
	await expect
		.poll(() =>
			Promise.all([
				page.locator('html').evaluate((element) => element.classList.contains('dark')),
				page.locator('html').evaluate((element) => element.style.colorScheme),
				shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--background')),
			]).then(([dark, currentColorScheme, background]) => ({
				dark,
				colorScheme: currentColorScheme,
				background,
			})),
		)
		.toMatchObject({
			dark: colorScheme === 'dark',
			colorScheme,
		});

	const background = await shell.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--background'),
	);
	// Chromium serializes the lightness as a percentage and may omit a leading
	// zero, so assert the rendered design token instead of CSS text formatting.
	expect(background).toMatch(
		colorScheme === 'dark' ? /^oklch\(18%\s+\.024\s+267\)$/ : /^oklch\(98\.5%\s+\.008\s+267\)$/,
	);
}

for (const viewport of viewports) {
	test(`admin follows system colors and stays contained at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto('/admin/login');

		// The head script applies dark mode before the admin page hydrates.
		await expectMode(page, 'dark');
		await page.getByLabel('Username').fill(credentials.username);
		await page.getByLabel('Password').fill(credentials.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/admin$/);
		await expectMode(page, 'dark');
		await expect(page.locator('#admin-main')).toBeVisible();
		await expectNoHorizontalOverflow(page);

		await page.emulateMedia({ colorScheme: 'light' });
		await expectMode(page, 'light');
		await page.goto('/admin/menu/items');
		await expect(page.getByRole('heading', { name: 'Menu items', level: 1 })).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});
}
