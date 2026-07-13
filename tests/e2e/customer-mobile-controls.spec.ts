import { expect, test, type Page } from '@playwright/test';

const routes = [
	{ name: 'public', path: '/', searchLabel: 'Search menu' },
	{ name: 'table', path: '/t/table-one-local', searchLabel: 'Search dishes' },
] as const;
const mobileWidths = [320, 375, 390, 412] as const;

async function assertMobileControls(page: Page, width: number, route: (typeof routes)[number]) {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(message.text());
	});
	page.on('response', (response) => {
		if (new URL(response.url()).origin === 'http://localhost:5173' && response.status() >= 400)
			problems.push(`${response.status()} ${response.url()}`);
	});

	await page.setViewportSize({ width, height: 780 });
	await page.goto(route.path);

	const tools = page.getByTestId('customer-menu-tools');
	const sidebar = tools.locator('.customer-menu-sidebar');
	const searchControl = tools.locator('.customer-menu-search');
	const search = tools.getByRole('textbox', { name: route.searchLabel });
	const currency = page.getByTestId('currency-selector-sticky');
	const euro = currency.getByRole('button', {
		name: /Display prices in Euro \(EUR\), Restaurant rate/,
	});
	const mains = tools.getByRole('link', { name: 'Mains' });

	await tools.scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollBy(0, 160));
	await expect(search).toBeVisible();
	await expect(currency).toBeVisible();
	await expect(page.locator('[data-testid^="currency-selector"]:visible')).toHaveCount(1);
	await expect(mains).toBeVisible();
	await expect
		.poll(async () => Math.round((await sidebar.boundingBox())?.y ?? -1))
		.toBeGreaterThanOrEqual(0);
	await expect
		.poll(async () => Math.round((await sidebar.boundingBox())?.y ?? -1))
		.toBeLessThanOrEqual(1);

	await expect(euro).toBeVisible();
	await euro.click();
	await expect(euro).toHaveAttribute('aria-pressed', 'true');
	await expect(currency).not.toContainText('MVR');

	await search.focus();
	await expect(search).toBeFocused();
	const searchBox = await searchControl.boundingBox();
	const inputBox = await search.boundingBox();
	const currencyBox = await currency.boundingBox();
	expect(searchBox).not.toBeNull();
	expect(inputBox).not.toBeNull();
	expect(currencyBox).not.toBeNull();
	expect(searchBox!.height).toBeGreaterThanOrEqual(44);
	expect(searchBox!.y).toBeGreaterThanOrEqual(0);
	expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(780);
	if (width === 320) {
		expect(searchBox!.width).toBeGreaterThanOrEqual(260);
		expect(inputBox!.width).toBeGreaterThanOrEqual(200);
		expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(currencyBox!.y + 1);
	}
	const targetSizes = await tools
		.locator(
			'.customer-menu-search button, .customer-currency-selector button, .customer-category-rail a',
		)
		.evaluateAll((elements) =>
			elements.map((element) => {
				const box = element.getBoundingClientRect();
				return {
					label: element.getAttribute('aria-label') ?? element.textContent,
					width: box.width,
					height: box.height,
				};
			}),
		);
	for (const target of targetSizes) {
		expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
		expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
	}
	await search.fill('Garden salad');
	await expect(page.getByRole('article').filter({ hasText: 'Garden salad' }).first()).toBeVisible();
	await expect(page.getByTestId('menu-search-result-count')).toContainText('1 result');
	await tools.getByRole('button', { name: 'Clear search' }).click();
	await search.fill('definitely-not-on-this-menu');
	await expect(page.getByTestId('menu-search-empty')).toBeVisible();
	await tools.getByRole('button', { name: 'Show all dishes' }).click();
	await expect(page.getByTestId('dish-local-item-burger')).toBeVisible();

	await mains.click();
	await expect(mains).toHaveAttribute('aria-current', 'location');
	await expect(page).toHaveURL(/#local-category-mains$/);
	const target = page.locator('#local-category-mains');
	await expect
		.poll(async () => {
			const [targetBox, sidebarBox] = await Promise.all([
				target.boundingBox(),
				sidebar.boundingBox(),
			]);
			return Math.round((targetBox?.y ?? -1) - ((sidebarBox?.y ?? 0) + (sidebarBox?.height ?? 0)));
		})
		.toBeGreaterThanOrEqual(-1);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
	expect(problems).toEqual([]);
}

for (const route of routes) {
	for (const width of mobileWidths) {
		test(`${route.name} mobile controls persist at ${width}px`, async ({ page }, testInfo) => {
			await assertMobileControls(page, width, route);
			await page.screenshot({
				path: testInfo.outputPath(`${route.name}-${width}-mobile-controls.png`),
			});
		});
	}
}
