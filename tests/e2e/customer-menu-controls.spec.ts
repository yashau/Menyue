import { expect, test, type Locator, type Page } from '@playwright/test';

const routes = [
	{ path: '/', dish: 'Menyue burger' },
	{ path: '/t/table-one-local', dish: 'Menyue burger' },
];

const searchCases = [
	{ query: 'mEnYuE  BURGER', item: 'local-item-burger' },
	{ query: 'house sauce', item: 'local-item-burger' },
	{ query: 'Màìñs', item: 'local-item-burger' },
	{ query: 'grill', item: 'local-item-burger' },
	{ query: 'gluten', item: 'local-item-burger' },
	{ query: 'vegan', item: 'local-item-salad' },
	{ query: 'Lunch offer', item: 'local-item-burger' },
] as const;

async function expectImageLoaded(image: Locator) {
	await expect
		.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
		.toBe(true);
}

async function assertSharedCustomerControls(page: Page, path: string, dish: string) {
	await page.goto(path);
	const currency = page.getByTestId('currency-selector');
	await expect(currency).toBeVisible();
	const euro = currency.getByRole('button', {
		name: /Display prices in Euro \(EUR\), Restaurant rate/,
	});
	const pound = currency.getByRole('button', {
		name: /Display prices in British Pound \(GBP\), Current rate/,
	});
	await expect(euro).toBeVisible();
	await expect(pound).toBeVisible();

	await euro.click();
	await expect(euro).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('article').filter({ hasText: dish }).first()).toContainText('€11.50');
	await pound.click();
	await expect(pound).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('article').filter({ hasText: dish }).first()).toContainText('£10.00');

	const tools = page.getByTestId('customer-menu-tools');
	await expect(tools.getByRole('link', { name: 'Starters' })).toHaveAttribute(
		'href',
		'#local-category-starters',
	);
	const search = tools.getByRole('textbox', {
		name: path === '/' ? 'Search menu' : 'Search dishes',
	});
	await search.fill('Garden salad');
	await expect(page.getByRole('article').filter({ hasText: 'Garden salad' }).first()).toBeVisible();
	await expect(page.getByRole('article').filter({ hasText: dish })).toHaveCount(0);
	await tools.getByRole('button', { name: 'Clear search' }).click();
	await expect(search).toHaveValue('');
}

for (const route of routes) {
	test(`customer controls are shared and accessible on ${route.path}`, async ({ page }) => {
		await assertSharedCustomerControls(page, route.path, route.dish);
	});

	test(`customer assets and metadata render on ${route.path}`, async ({ page }, testInfo) => {
		if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 375, height: 812 });
		const failures: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') failures.push(message.text());
		});
		page.on('requestfailed', (request) =>
			failures.push(`${request.url()} ${request.failure()?.errorText ?? ''}`),
		);
		await page.goto(route.path);

		const uploaded = page.getByTestId('dish-local-item-fries');
		const uploadedImage = uploaded.locator('img');
		await expect(uploadedImage).toHaveAttribute('src', '/media/local-asset-seasoned-fries');
		await expect(uploadedImage).toBeVisible();
		await expectImageLoaded(uploadedImage);
		const direct = page.getByTestId('dish-local-item-salad');
		const directImage = direct.locator('img');
		await expect(directImage).toHaveAttribute(
			'src',
			'/media/static?src=%2Fmenu%2Fgarden-salad.png',
		);
		await expect(directImage).toBeVisible();
		await expectImageLoaded(directImage);

		const burger = page.getByTestId('dish-local-item-burger');
		await expect(burger).toContainText('Offer · Lunch offer');
		await expect(burger).toContainText('Available in the demo menu.');
		await expect(burger).toContainText('Contains gluten and dairy.');
		await expect(burger.getByLabel('Allergy information').getByRole('listitem')).toHaveCount(1);
		await expect(direct).toContainText('Dietary · vegetarian');
		await expect(direct).toContainText('Dietary · vegan');
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
			),
		).toBe(true);
		await uploaded.screenshot({
			path: `test-results/screenshots/customer-uploaded-${route.path === '/' ? 'home' : 'table'}-${testInfo.project.name}.png`,
		});
		await direct.screenshot({
			path: `test-results/screenshots/customer-static-${route.path === '/' ? 'home' : 'table'}-${testInfo.project.name}.png`,
		});
		await burger.scrollIntoViewIfNeeded();
		await expectImageLoaded(burger.locator('img'));
		await burger.screenshot({
			path: `test-results/screenshots/customer-metadata-${route.path === '/' ? 'home' : 'table'}-${testInfo.project.name}.png`,
		});

		const search = page.getByTestId('customer-menu-tools').getByRole('textbox');
		await search.fill('refreshing');
		await expect(page.getByTestId('dish-local-item-water')).toBeVisible();
		expect(failures).toEqual([]);
	});

	test(`customer search indexes menu metadata and restores groups on ${route.path}`, async ({
		page,
	}) => {
		await page.goto(route.path);
		const tools = page.getByTestId('customer-menu-tools');
		const search = tools.getByRole('textbox');

		for (const { query, item } of searchCases) {
			await search.fill(query);
			await expect(page.getByTestId(`dish-${item}`)).toBeVisible();
			const visibleDishes = await page.locator('[data-testid^="dish-"]').count();
			await expect(page.getByTestId('menu-search-result-count')).toContainText(
				new RegExp(`^${visibleDishes} result${visibleDishes === 1 ? '' : 's'} for`),
			);
		}

		await search.fill('definitely-not-on-this-menu');
		await expect(page.getByTestId('menu-search-result-count')).toContainText('0 results');
		await expect(page.getByTestId('menu-search-empty')).toBeVisible();
		await expect(tools.getByRole('link')).toHaveCount(0);
		await tools.getByRole('button', { name: 'Show all dishes' }).click();
		await expect(search).toHaveValue('');
		await expect(page.getByTestId('dish-local-item-burger')).toBeVisible();
		await expect(tools.getByRole('link', { name: 'Starters' })).toBeVisible();
		await expect(tools.getByRole('link', { name: 'Mains' })).toBeVisible();
	});
}

test('table search keeps Add wired to the draft flow', async ({ page }) => {
	await page.goto('/t/table-one-local');
	const search = page
		.getByTestId('customer-menu-tools')
		.getByRole('textbox', { name: 'Search dishes' });
	await search.fill('Lunch offer');
	await page.getByTestId('add-local-item-burger').click();
	await expect(page.getByTestId('modifier-local-item-burger')).toBeVisible();
});
