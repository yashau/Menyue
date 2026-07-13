import { expect, test, type Page } from '@playwright/test';

const routes = [
	{ name: 'public', path: '/', searchLabel: 'Search menu' },
	{ name: 'table', path: '/t/table-one-local', searchLabel: 'Search dishes' },
] as const;

async function assertSidebar(page: Page, width: number, path: string, searchLabel: string) {
	const browserErrors: string[] = [];
	page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
	page.on('response', (response) => {
		if (new URL(response.url()).origin === 'http://localhost:5173' && response.status() >= 400)
			browserErrors.push(`${response.status()} ${response.url()}`);
	});
	await page.setViewportSize({ width, height: 900 });
	await page.goto(path);

	const tools = page.getByTestId('customer-menu-tools');
	const sidebar = tools.locator('.customer-menu-sidebar');
	const mains = tools.getByRole('link', { name: 'Mains' });
	await expect(sidebar).toBeVisible();
	const currency = page.getByTestId('currency-selector');
	const euro = currency.getByRole('button', { name: /Display prices in Euro \(EUR\), Restaurant rate/ });
	const search = tools.getByRole('textbox', { name: searchLabel });
	await expect(currency).toBeVisible();
	await euro.click();
	await expect(euro).toHaveAttribute('aria-pressed', 'true');
	await search.fill('Garden salad');
	await expect(page.getByRole('article').filter({ hasText: 'Garden salad' }).first()).toBeVisible();
	await tools.getByRole('button', { name: 'Clear search' }).click();

	await mains.focus();
	await expect(mains).toBeFocused();
	await mains.click();
	await expect(mains).toHaveAttribute('aria-current', 'location');
	await expect(page).toHaveURL(/#local-category-mains$/);

	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
	await expect.poll(async () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBeGreaterThanOrEqual(0);
	await expect.poll(async () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBeLessThanOrEqual(18);
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	expect(browserErrors).toEqual([]);
}

for (const route of routes) {
	for (const width of [768, 1440]) {
		test(`${route.name} category sidebar persists at ${width}px`, async ({ page }, testInfo) => {
			await assertSidebar(page, width, route.path, route.searchLabel);
			await page.screenshot({ path: testInfo.outputPath(`${route.name}-${width}-category-sidebar.png`) });
		});
	}
}

test('table category sidebar stays below the order surfaces', async ({ page }) => {
	await assertSidebar(page, 1440, '/t/table-one-local', 'Search dishes');
	await page.getByTestId('add-local-item-salad').click();
	const draft = page.getByTestId('order-draft');
	await expect(draft).toBeVisible();
	await draft.getByTestId('draft-review').click();
	await draft.getByTestId('draft-commit').click();
	await page.getByTestId('cart-open').click();
	await expect(page.locator('.cart-sheet')).toBeVisible();
	await expect(page.locator('.customer-menu-sidebar')).toHaveCSS('z-index', 'auto');
	await expect(page.locator('.cart-sheet')).toHaveCSS('z-index', '11');
});
