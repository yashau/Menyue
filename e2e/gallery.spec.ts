import { test } from '@playwright/test';
import { TABLE1, login } from './helpers';

// Not assertions — captures screenshots of every surface for design review.
const shot = 'e2e/screenshots';

test('gallery: guest wizard', async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
	await page.getByTestId('search-input').fill('margherita');
	await page.getByRole('button', { name: /Customize Margherita/ }).click();
	await page.getByRole('dialog').waitFor();
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${shot}/gallery-wizard.png` });
});

test('gallery: guest cart', async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Add Coconut Prawn Skewers to cart' }).click();
	await page.getByRole('button', { name: 'Add Tuna Kandukukulhu Rolls to cart' }).click();
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${shot}/gallery-cart.png` });
});

test('gallery: counter board', async ({ page, request }) => {
	const place = async (lines: { itemId: number; quantity: number; notes?: string }[]) => {
		const key = (await (await request.post(`/t/${TABLE1}/key`)).json()).key as string;
		await request.post(`/t/${TABLE1}/order`, {
			data: { idempotencyKey: key, lines: lines.map((l) => ({ ...l, isSuggested: false, options: [] })) }
		});
	};
	await place([{ itemId: 1, quantity: 2, notes: 'no chilli' }]);
	await place([{ itemId: 3, quantity: 1 }]);
	await place([{ itemId: 40, quantity: 1, notes: 'extra napkins' }]);
	// a large multi-item order → tall card, to show masonry sizing/placement
	await place([
		{ itemId: 74, quantity: 3 },
		{ itemId: 1, quantity: 1 },
		{ itemId: 3, quantity: 2 },
		{ itemId: 40, quantity: 1, notes: 'well done' },
		{ itemId: 20, quantity: 2 },
		{ itemId: 15, quantity: 1 },
		{ itemId: 50, quantity: 4, notes: 'to share' }
	]);
	await place([{ itemId: 15, quantity: 1 }]);

	await page.setViewportSize({ width: 1280, height: 900 });
	await login(page, 'counter');
	await page.waitForTimeout(500);
	// advance a couple of orders so the board shows New / Accepted / Preparing colours
	await page.locator('[data-testid=accept-btn]').first().click();
	await page.waitForTimeout(400);
	await page.locator('[data-testid=prepare-btn]').first().click();
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${shot}/gallery-counter.png` });
	// mobile view (how the staff phone sees it)
	await page.setViewportSize({ width: 390, height: 850 });
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${shot}/gallery-counter-mobile.png` });
});

test('gallery: admin surfaces', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await login(page, 'admin');
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${shot}/gallery-admin-dashboard.png` });
	await page.goto('/admin/menu', { waitUntil: 'networkidle' });
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${shot}/gallery-admin-menu.png` });
	await page.goto('/admin/settings', { waitUntil: 'networkidle' });
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${shot}/gallery-admin-settings.png`, fullPage: true });
});
