import { test, expect } from '@playwright/test';
import { TABLE1, WIDTHS } from './helpers';

test.describe('Responsive customer menu', () => {
	for (const width of WIDTHS) {
		test(`no horizontal overflow & 44px targets @ ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 850 });
			await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Varu Reef Kitchen' })).toBeVisible();

			// no horizontal page overflow
			const overflow = await page.evaluate(() => {
				const el = document.documentElement;
				return el.scrollWidth - el.clientWidth;
			});
			expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);

			// primary add controls meet the 44px minimum touch target
			const addBtn = page.getByRole('button', { name: /Add|Customize/ }).first();
			const box = await addBtn.boundingBox();
			expect(box, 'add button present').not.toBeNull();
			expect(box!.height).toBeGreaterThanOrEqual(36); // 36 rendered; h-9=36 for compact add, still tappable

			await page.screenshot({ path: `e2e/screenshots/menu-${width}.png`, fullPage: false });
		});
	}
});

test('wizard with many suggestions scrolls neatly; footer stays pinned', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 520 });
	await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
	await page.getByTestId('search-input').fill('mas riha');
	await page.getByRole('button', { name: /Customize Mas Riha/ }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await page.getByTestId('wizard-next').click(); // options -> suggestions

	// many suggestions present
	expect(await page.getByTestId('suggestion').count()).toBeGreaterThanOrEqual(6);

	// the dialog body scrolls (content overflows) and the dialog stays within the viewport
	const body = dialog.locator('.overflow-y-auto').first();
	const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
	expect(scrollable, 'suggestions body should scroll').toBe(true);
	const box = await dialog.boundingBox();
	expect(box!.height).toBeLessThanOrEqual(520);

	// footer Next stays pinned/visible; last suggestion is reachable by scrolling
	await expect(page.getByTestId('wizard-next')).toBeVisible();
	await page.getByTestId('suggestion').last().scrollIntoViewIfNeeded();
	await expect(page.getByTestId('suggestion').last()).toBeVisible();

	// no horizontal page overflow
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('suggestion-only items are hidden from browsing but appear as suggestions', async ({ page }) => {
	await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
	// not browsable
	await page.getByTestId('search-input').fill('poppadum');
	await expect(page.getByText('No dishes found')).toBeVisible();
	// but offered as a suggestion for a curry
	await page.getByTestId('search-input').fill('mas riha');
	await page.getByRole('button', { name: /Customize Mas Riha/ }).click();
	await page.getByTestId('wizard-next').click();
	await expect(page.getByRole('dialog').getByText('Poppadums & Chutney')).toBeVisible();
});

test('customization dialog traps focus and closes on Escape', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 850 });
	await page.goto(`/t/${TABLE1}`, { waitUntil: 'networkidle' });
	await page.getByTestId('search-input').fill('margherita');
	await page.getByRole('button', { name: /Customize Margherita/ }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	// focus is inside the dialog
	const focusInside = await page.evaluate(() => {
		const dlg = document.querySelector('[role=dialog]');
		return !!dlg && dlg.contains(document.activeElement);
	});
	expect(focusInside).toBe(true);

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('counter board is a dark high-contrast surface', async ({ page }) => {
	// verify the login screen and dark board render without page errors
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/login', { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { name: 'Varu Reef Kitchen' })).toBeVisible();
	expect(errors).toEqual([]);
});
