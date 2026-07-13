import { expect, test, type Locator, type Page } from '@playwright/test';

const token = 'table-one-local';
const orderEndpoint = `**/api/tables/${token}/orders`;

type SubmittedLine = { itemId: string; quantity: number; choiceIds: string[]; note?: string };

async function visit(page: Page) {
	await page.goto(`/t/${token}`);
	await expect(page.getByTestId('dish-local-item-burger')).toBeVisible();
	// Wait for hydration before exercising the client-owned order wizard.
	await page.waitForTimeout(200);
}

async function addPlainItem(page: Page, itemId: string) {
	await page.getByTestId(`add-${itemId}`).click();
	await expect(page.getByRole('dialog', { name: 'Ready to add?' })).toBeVisible();
	await page.getByTestId('draft-commit').click();
}

async function interceptSubmission(page: Page) {
	const payloads: SubmittedLine[][] = [];
	await page.route(orderEndpoint, async (route) => {
		payloads.push((route.request().postDataJSON() as { lines: SubmittedLine[] }).lines);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ order: { displayNumber: 42 }, nextIdempotencyKey: 'next-test-key' }),
		});
	});
	return payloads;
}

async function submitWithoutDrink(page: Page) {
	await page.getByTestId('submit-order').click();
	await expect(page.getByTestId('beverage-prompt')).toBeVisible();
	await page.getByTestId('beverage-skip').click();
	await expect(page.getByRole('dialog', { name: /thank you/i })).toBeVisible();
}

function cartLines(page: Page) {
	return page.getByRole('complementary', { name: 'Ready for the kitchen?' }).locator('.cart-line');
}

function expectWithinViewport(page: Page, locator: Locator) {
	return expect.poll(async () => {
		const [box, viewport] = await Promise.all([
			locator.boundingBox(),
			page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
		]);
		if (!box) return false;
		return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
	}).toBe(true);
}

function expectFitsViewportWidth(page: Page, locator: Locator) {
	return expect.poll(async () => {
		const [box, width] = await Promise.all([locator.boundingBox(), page.evaluate(() => window.innerWidth)]);
		return !!box && box.x >= 0 && box.x + box.width <= width;
	}).toBe(true);
}

test('customizing one of two plates preserves two payload variants', async ({ page }) => {
	await visit(page);
	await page.getByTestId('add-local-item-burger').click();
	await page.getByTestId('choice-local-choice-salad').check();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('draft-review').click();
	await page.getByTestId('draft-commit').click();

	await page.getByTestId('cart-open').click();
	await page.getByRole('button', { name: 'Increase Menyue burger' }).click();
	await expect(page.getByLabel('Quantity 2')).toBeVisible();
	await cartLines(page).filter({ hasText: 'Menyue burger' }).getByRole('button', { name: 'Edit' }).click();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('draft-review').click();
	await page.getByLabel('Note for Menyue burger').fill('less salty');
	await page.getByTestId('draft-commit').click();

	await expect(cartLines(page)).toHaveCount(2);
	await expect(cartLines(page).filter({ hasText: 'less salty' })).toHaveCount(1);
	const payloads = await interceptSubmission(page);
	await submitWithoutDrink(page);
	expect(payloads).toHaveLength(1);
	expect(payloads[0].filter((line) => line.itemId === 'local-item-burger')).toEqual([
		{ itemId: 'local-item-burger', quantity: 1, choiceIds: ['local-choice-salad'] },
		{ itemId: 'local-item-burger', quantity: 1, choiceIds: ['local-choice-salad'], note: 'less salty' },
	]);
});

test('a nonzero default modifier is included in the displayed cart and server total', async ({ page }) => {
	await visit(page);
	await page.getByTestId('add-local-item-burger').click();
	await expect(page.getByTestId('choice-local-choice-fries')).toBeChecked();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('draft-review').click();
	await expect(page.getByTestId('draft-total')).toContainText('$13.00');
	await page.getByTestId('draft-commit').click();
	await page.getByTestId('cart-open').click();
	await expect(page.getByText('Estimated total $13.00')).toBeVisible();
	const responsePromise = page.waitForResponse((response) => response.url().includes(`/api/tables/${token}/orders`) && response.request().method() === 'POST');
	await page.getByTestId('submit-order').click();
	await page.getByTestId('beverage-skip').click();
	const response = await responsePromise;
	expect((await response.json()).order.totalMinor).toBe(1300);
});

test('a suggested configurable drink requires and submits its own choices', async ({ page }) => {
	await visit(page);
	await page.getByTestId('add-local-item-burger').click();
	await page.getByTestId('choice-local-choice-salad').check();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('suggestion-add-local-item-water').click();
	await expect(page.getByTestId('modifier-local-item-water')).toBeVisible();
	await expect(page.getByTestId('choice-local-choice-water-chilled')).toBeChecked();
	await page.getByTestId('choice-local-choice-water-room').check();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('draft-review').click();
	await expect(page.getByTestId('draft-review-lines')).toContainText('Room temperature');
	await page.getByTestId('draft-commit').click();

	const payloads = await interceptSubmission(page);
	await page.getByTestId('submit-order').click();
	await expect(page.getByTestId('beverage-prompt')).toBeHidden();
	await expect(page.getByRole('dialog', { name: /thank you/i })).toBeVisible();
	expect(payloads[0]).toEqual(expect.arrayContaining([
		{ itemId: 'local-item-water', quantity: 1, choiceIds: ['local-choice-water-room'], suggestedFromItemId: 'local-item-burger' },
	]));
});

test('beverage prompt recovers from Back, configures drinks, and skips only once', async ({ page }) => {
	await visit(page);
	await addPlainItem(page, 'local-item-fries');
	const payloads = await interceptSubmission(page);

	await page.getByTestId('submit-order').click();
	await expect(page.getByTestId('beverage-prompt')).toBeVisible();
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page.getByTestId('beverage-prompt')).toBeHidden();
	await expect(page.getByTestId('cart-open')).toContainText('1 dish');
	await page.getByTestId('submit-order').click();
	await page.getByTestId('beverage-add-local-item-water').click();
	await expect(page.getByTestId('modifier-local-item-water')).toBeVisible();
	await page.getByTestId('choice-local-choice-water-room').check();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('draft-commit').click();
	await expect(page.getByRole('dialog', { name: /thank you/i })).toBeVisible();
	expect(payloads).toHaveLength(1);
	expect(payloads[0]).toEqual(expect.arrayContaining([
		{ itemId: 'local-item-fries', quantity: 1, choiceIds: [] },
		{ itemId: 'local-item-water', quantity: 1, choiceIds: ['local-choice-water-room'] },
	]));

	await page.getByRole('button', { name: /continue browsing/i }).click();
	await addPlainItem(page, 'local-item-fries');
	await page.getByTestId('submit-order').click();
	await expect(page.getByTestId('beverage-prompt')).toBeVisible();
	await page.getByTestId('beverage-skip').click();
	await expect(page.getByTestId('beverage-prompt')).toBeHidden();
	await expect(page.getByRole('dialog', { name: /thank you/i })).toBeVisible();
	expect(payloads).toHaveLength(2);
});

test('zero-stage and rapid Back/Continue paths terminate without looping', async ({ page }) => {
	await visit(page);
	let interactions = 0;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		await page.getByTestId('add-local-item-fries').click(); interactions += 1;
		await expect(page.getByRole('dialog', { name: 'Ready to add?' })).toBeVisible();
		await page.getByRole('button', { name: 'Back' }).click(); interactions += 1;
		await expect(page.getByTestId('order-draft')).toBeHidden();
	}
	await page.getByTestId('add-local-item-burger').click(); interactions += 1;
	await page.getByTestId('choice-local-choice-salad').check(); interactions += 1;
	await page.getByTestId('draft-next').click(); interactions += 1;
	await page.getByRole('button', { name: 'Back' }).click(); interactions += 1;
	await expect(page.getByTestId('modifier-local-item-burger')).toBeVisible();
	await page.getByTestId('draft-next').click(); interactions += 1;
	await page.getByTestId('draft-review').click(); interactions += 1;
	await page.getByRole('button', { name: 'Back' }).click(); interactions += 1;
	await page.getByTestId('draft-review').click(); interactions += 1;
	await page.getByTestId('draft-commit').click(); interactions += 1;
	await expect(page.getByTestId('order-draft')).toBeHidden();
	await expect(page.getByTestId('cart-open')).toContainText('1 dish');
	expect(interactions).toBeLessThanOrEqual(16);
});

test('cart quantities, removing one variant, totals, and the 30-line guard stay coherent', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The line-cap boundary is covered once; dialog layout is covered on mobile.');
	await visit(page);
	await addPlainItem(page, 'local-item-fries');
	await page.getByTestId('cart-open').click();
	await page.getByRole('button', { name: 'Increase Seasoned fries' }).click();
	await expect(page.getByLabel('Quantity 2')).toBeVisible();
	await expect(page.getByText('Estimated total $13.00')).toBeVisible();
	await page.getByRole('button', { name: 'Decrease Seasoned fries' }).click();
	await page.getByRole('button', { name: 'Remove Seasoned fries' }).click();
	await expect(page.getByTestId('cart-open')).toBeHidden();

	for (let item = 1; item <= 30; item += 1) await addPlainItem(page, `fixture-item-${item}`);
	await expect(page.getByTestId('cart-open')).toContainText('30 dishes');
	await page.getByTestId('add-fixture-item-31').click();
	await page.getByTestId('draft-commit').click();
	await expect(page.getByText('An order can contain up to 30 separate item lines.')).toBeVisible();
	await expect(page.getByTestId('cart-open')).toContainText('30 dishes');
});

test('customer cards, wizard dialogs, and cart fit the customer viewport matrix', async ({ page }, testInfo) => {
	const widths = testInfo.project.name === 'mobile' ? [320, 360, 375, 390, 412] : [768, 1024, 1440];
	for (const width of widths) {
		await page.setViewportSize({ width, height: 900 });
		await visit(page);
		const body = page.locator('body');
		const card = page.getByTestId('dish-local-item-burger');
		await card.scrollIntoViewIfNeeded();
		await expectFitsViewportWidth(page, body);
		await expectWithinViewport(page, card);
		await page.getByTestId('add-local-item-burger').click();
		await expectWithinViewport(page, page.getByTestId('order-draft'));
		await page.getByTestId('draft-cancel').click();
		await addPlainItem(page, 'local-item-fries');
		await page.getByTestId('cart-open').click();
		await expectWithinViewport(page, page.getByRole('complementary', { name: 'Ready for the kitchen?' }));
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	}
});
