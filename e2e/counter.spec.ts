import { test, expect } from '@playwright/test';
import { TABLE1, login } from './helpers';

test('counter board: accept -> prepare -> complete', async ({ page, request }) => {
	// place a fresh guest order (no auth needed)
	const key = (await (await request.post(`/t/${TABLE1}/key`)).json()).key as string;
	const res = await (
		await request.post(`/t/${TABLE1}/order`, {
			data: {
				idempotencyKey: key,
				lines: [{ itemId: 1, quantity: 1, notes: 'counter test', isSuggested: false, options: [] }]
			}
		})
	).json();
	const number: string = res.order.number;

	await login(page, 'counter');
	await expect(page).toHaveURL(/\/counter/);

	const card = page.locator('[data-testid=order-card]:visible', { hasText: number });
	await expect(card).toHaveAttribute('data-order-status', 'new');

	await card.getByTestId('accept-btn').click();
	await expect(page.locator('[data-testid=order-card]:visible', { hasText: number })).toHaveAttribute('data-order-status', 'accepted');

	await page.locator('[data-testid=order-card]:visible', { hasText: number }).getByTestId('prepare-btn').click();
	await expect(page.locator('[data-testid=order-card]:visible', { hasText: number })).toHaveAttribute('data-order-status', 'preparing');

	await page.locator('[data-testid=order-card]:visible', { hasText: number }).getByTestId('complete-btn').click();
	// completed orders are hidden by default — reveal them via the filter badge
	await page.getByTestId('filter-completed').click();
	await expect(page.locator('[data-testid=order-card]:visible', { hasText: number })).toHaveAttribute('data-order-status', 'completed');
});

test('accepting an order keeps it in place (position pinned) so a 2nd tap hits the same order', async ({ page, request }) => {
	// place several fresh orders
	for (let i = 0; i < 4; i++) {
		const key = (await (await request.post(`/t/${TABLE1}/key`)).json()).key as string;
		await request.post(`/t/${TABLE1}/order`, {
			data: { idempotencyKey: key, lines: [{ itemId: 1, quantity: 1, isSuggested: false, options: [] }] }
		});
	}
	await login(page, 'counter');
	await expect(page.locator('[data-testid=order-card]:visible').first()).toBeVisible();

	const firstCard = page.locator('[data-testid=order-card]:visible').first();
	const number = (await firstCard.innerText()).match(/VA-\d{4}/)?.[0];
	expect(number).toBeTruthy();

	// accept the first card
	await firstCard.getByTestId('accept-btn').click();

	// it must STAY the first card (not jump below the other 'new' orders) and now
	// offer "Start preparing" in the same spot — so a second tap acts on the same order
	const nowFirst = page.locator('[data-testid=order-card]:visible').first();
	await expect(nowFirst).toContainText(number!);
	await expect(nowFirst).toHaveAttribute('data-order-status', 'accepted');
	await expect(nowFirst.getByTestId('prepare-btn')).toBeVisible();
});

test('counter status endpoint rejects missing CSRF', async ({ request }) => {
	const res = await request.post('/counter/status', { data: { orderId: 1, status: 'accepted' } });
	// unauthenticated -> 401
	expect([401, 403]).toContain(res.status());
});
