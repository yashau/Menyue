import { test, expect } from '@playwright/test';
import { TABLE1 } from './helpers';

test.describe('Guest menu', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { name: 'Varu Reef Kitchen' })).toBeVisible();
	});

	test('renders 100+ items and search filters', async ({ page }) => {
		const cards = page.getByTestId('item-card');
		expect(await cards.count()).toBeGreaterThan(100);

		await page.getByTestId('search-input').fill('burger');
		await expect(page.getByTestId('result-count')).toContainText('result');
		const filtered = await page.getByTestId('item-card').count();
		expect(filtered).toBeGreaterThan(0);
		expect(filtered).toBeLessThan(20);

		// no-results state
		await page.getByTestId('search-input').fill('zzzznotathing');
		await expect(page.getByText('No dishes found')).toBeVisible();
	});

	test('currency switch shows converted, estimated prices', async ({ page }) => {
		const firstCard = page.getByTestId('item-card').first();
		await expect(firstCard).toContainText('Rf');
		await page.getByTestId('currency-select').selectOption('USD');
		await expect(firstCard).toContainText('$');
	});

	test('wizard enforces required options, then adds atomically', async ({ page }) => {
		await page.getByTestId('search-input').fill('margherita');
		await page.getByRole('button', { name: /Customize Margherita/ }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		// Size is required with no default -> Next is blocked and flags the group
		await page.getByTestId('wizard-next').click();
		await expect(dialog.locator('[data-testid=option-group][data-invalid="true"]')).toHaveCount(1);
		await expect(page.getByRole('dialog')).toBeVisible(); // still open on the options step

		// choose a size, advance to suggestions
		await dialog.locator('label:has-text("Regular")').first().click();
		await page.getByTestId('wizard-next').click();
		await expect(dialog.getByText(/nothing is added until you confirm/i)).toBeVisible();

		// advance to review and confirm
		await page.getByTestId('wizard-next').click();
		await page.getByTestId('wizard-confirm').click();
		await expect(page.getByRole('dialog')).toHaveCount(0);

		// order summary now has the line + subtotal
		await expect(page.getByTestId('cart-subtotal')).toBeVisible();
		await expect(page.getByTestId('checkout-btn').first()).toBeVisible();
	});

	test('full order flow: cart -> beverage prompt -> confirmation', async ({ page }) => {
		// add two simple, non-beverage items so an eligible drink is NOT yet in the cart
		await page.getByRole('button', { name: 'Add Tuna Kandukukulhu Rolls to cart' }).click();
		await page.getByRole('button', { name: 'Add Coconut Prawn Skewers to cart' }).click();

		await page.getByTestId('checkout-btn').first().click();

		// beverage prompt appears; pick a drink (quantity), then add & send
		await expect(page.getByTestId('beverage-add').first()).toBeVisible();
		await page.getByTestId('beverage-add').first().click();
		await expect(page.getByTestId('beverage-qty').first()).toHaveText('1');
		await page.getByTestId('beverage-send').click();

		// confirmation with an order number
		await expect(page.getByTestId('confirmation-heading')).toBeVisible();
		await expect(page.getByTestId('order-number')).toContainText(/VA-\d{4}/);
		await page.getByTestId('confirmation-done').click();
		await expect(page.getByTestId('confirmation-heading')).toHaveCount(0);
	});

	test('already has a drink → no drinks upsell, but still offers water (chilled/unchilled)', async ({ page }) => {
		// add a non-water drink from the menu
		await page.getByRole('button', { name: 'Add Cola to cart' }).click();
		await page.getByTestId('checkout-btn').first().click();

		// drinks section suppressed, water section shown
		await expect(page.getByTestId('beverage-option')).toHaveCount(0);
		await expect(page.getByTestId('water-option')).toHaveCount(2);

		// choose chilled water and send
		await page.getByTestId('water-add-chilled').click();
		await page.getByTestId('beverage-send').click();
		await expect(page.getByTestId('order-number')).toContainText(/VA-\d{4}/);
	});
});

test.describe('Order idempotency (server contract)', () => {
	test('lost-response retry is safe, then a distinct second order', async ({ request }) => {
		// issue a server key
		const key1 = (await (await request.post(`/t/${TABLE1}/key`)).json()).key as string;
		const body = {
			idempotencyKey: key1,
			displayCurrencyCode: 'USD',
			lines: [{ itemId: 1, quantity: 1, notes: '', isSuggested: false, options: [] }]
		};
		const first = await (await request.post(`/t/${TABLE1}/order`, { data: body })).json();
		expect(first.status).toBe('created');

		// simulate a lost response: retry with the SAME key
		const retry = await (await request.post(`/t/${TABLE1}/order`, { data: body })).json();
		expect(retry.status).toBe('duplicate');
		expect(retry.order.number).toBe(first.order.number);

		// a later distinct order uses a fresh key and cannot replay the previous one
		const key2 = (await (await request.post(`/t/${TABLE1}/key`)).json()).key as string;
		expect(key2).not.toBe(key1);
		const second = await (
			await request.post(`/t/${TABLE1}/order`, { data: { ...body, idempotencyKey: key2 } })
		).json();
		expect(second.status).toBe('created');
		expect(second.order.number).not.toBe(first.order.number);
	});
});
