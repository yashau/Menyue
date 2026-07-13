import { expect, test, type Page } from '@playwright/test';

const token = 'table-one-local';

async function visit(page: Page) {
	await page.goto(`/t/${token}`);
	await expect(page.getByTestId('dish-local-item-burger')).toBeVisible();
	// The production bundle hydrates after SSR; wait before exercising client-side dialogs.
	await page.waitForTimeout(250);
}

async function addBurgerWithConfiguredSuggestion(page: Page) {
	await page.getByTestId('add-local-item-burger').click();
	await expect(page.getByTestId('modifier-local-item-burger')).toBeVisible();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('suggestion-add-local-item-water').click();
	await expect(page.getByTestId('modifier-local-item-water')).toBeVisible();
	await page.getByTestId('choice-local-choice-water-room').check();
	await page.getByTestId('draft-next').click();
	await expect(page.getByTestId('draft-child-local-item-water')).toContainText('Lime water');
	await page.getByTestId('draft-review').click();
	await expect(page.getByTestId('draft-review-lines')).toContainText('Room temperature');
	await page.getByTestId('draft-commit').click();
}

test('required-modifier suggestion stays in the draft and Escape is atomic', async ({ page }) => {
	await visit(page);
	await page.getByTestId('add-local-item-burger').click();
	await page.getByTestId('draft-next').click();
	await page.getByTestId('suggestion-add-local-item-water').click();
	await expect(page.getByTestId('modifier-local-item-water')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('order-draft')).not.toBeVisible();
	await expect(page.getByTestId('cart-open')).not.toBeVisible();
});

test('required-modifier beverage configures before it reaches the cart', async ({ page }) => {
	await visit(page);
	await page.getByTestId('add-local-item-fries').click();
	await page.getByTestId('draft-commit').click();
	await page.getByTestId('submit-order').click();
	await expect(page.getByTestId('beverage-prompt')).toBeVisible();
	await page.getByTestId('beverage-add-local-item-water').click();
	await expect(page.getByTestId('modifier-local-item-water')).toBeVisible();
	await page.getByTestId('choice-local-choice-water-room').check();
	await page.getByTestId('draft-next').click();
	await expect(page.getByTestId('draft-review-lines')).toContainText('Room temperature');
	await page.getByTestId('draft-commit').click();
	await expect(page.getByTestId('cart-open')).toContainText('2 dishes');
});

test('editing replaces the original group and submits a flat payload', async ({ page }) => {
	await visit(page);
	await addBurgerWithConfiguredSuggestion(page);
	await page.getByTestId('cart-open').click();
	await expect(page.getByTestId('cart-child-local-item-water')).toContainText('Room temperature');
	await page.getByTestId('edit-local-item-burger').click();
	await page.getByTestId('choice-local-choice-salad').check();
	await page.getByTestId('draft-next').click();
	await expect(page.getByTestId('draft-child-local-item-water')).toBeVisible();
	await page.getByTestId('draft-review').click();
	await page.getByTestId('draft-commit').click();
	await expect(page.getByTestId('cart-open')).toContainText('2 dishes');

	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === 'POST' && request.url().includes(`/api/tables/${token}/orders`),
	);
	await page.getByTestId('submit-order').click();
	const request = await requestPromise;
	const payload = request.postDataJSON() as {
		lines: Array<{ itemId: string; choiceIds: string[]; suggestedFromItemId?: string }>;
	};
	expect(payload.lines).toEqual([
		{ itemId: 'local-item-burger', quantity: 1, choiceIds: ['local-choice-salad'] },
		{
			itemId: 'local-item-water',
			quantity: 1,
			choiceIds: ['local-choice-water-room'],
			suggestedFromItemId: 'local-item-burger',
		},
	]);
	await expect(page.getByText('Order sent')).toBeVisible();
});
