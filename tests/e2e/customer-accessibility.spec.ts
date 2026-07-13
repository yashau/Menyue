import { expect, test, type Locator, type Page } from '@playwright/test';

const widths = [320, 768, 1440] as const;

async function tabTo(page: Page, target: Locator, limit = 160) {
	for (let step = 0; step < limit; step += 1) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((element) => element === document.activeElement)) return;
	}
	throw new Error(`Keyboard focus did not reach ${await target.evaluate((element) => element.outerHTML)}; active: ${await page.evaluate(() => document.activeElement?.outerHTML)}`);
}

async function expectNoOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of widths) {
	for (const route of [
		{ path: '/', search: 'Search menu' },
		{ path: '/t/table-one-local', search: 'Search dishes' },
	] as const) {
		test(`${route.path} has one main landmark and keyboard-reachable controls at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(route.path);

			await expect(page.getByRole('main')).toHaveCount(1);
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
			const search = page.getByRole('textbox', { name: route.search });
			await tabTo(page, search);
			await expect(search).toBeFocused();
			await expect(search).toHaveCSS('outline-style', 'solid');
			await search.fill('Garden salad');
			await expect(page.getByTestId('dish-local-item-salad')).toBeVisible();
			await expectNoOverflow(page);
		});
	}

	test(`table ordering dialogs and cart are keyboard-operable at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/t/table-one-local');

		const addSalad = page.getByTestId('add-local-item-salad');
		await tabTo(page, addSalad);
		await page.keyboard.press('Enter');
		const draft = page.getByRole('dialog');
		await expect(draft).toBeVisible();
		await expect(draft).toHaveAccessibleName(/goes well with|ready to add|garden salad/i);
		await expect.poll(() => draft.evaluate((element) => element.contains(document.activeElement))).toBe(true);
		for (let step = 0; step < 8; step += 1) {
			await page.keyboard.press('Tab');
			await expect.poll(() => draft.evaluate((element) => element.contains(document.activeElement))).toBe(true);
		}
		await page.keyboard.press('Escape');
		await expect(draft).toBeHidden();
		await expect(addSalad).toBeFocused();

		await page.keyboard.press('Enter');
		await tabTo(page, page.getByTestId('draft-review'));
		await page.keyboard.press('Enter');
		await tabTo(page, page.getByTestId('draft-commit'));
		await page.keyboard.press('Enter');
		await expect(draft).toBeHidden();
		await expect(addSalad).toBeFocused();

		const cartToggle = page.getByTestId('cart-open');
		await tabTo(page, cartToggle);
		await page.keyboard.press('Enter');
		await expect(cartToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(cartToggle).toHaveAttribute('aria-controls', 'table-cart');
		await expect(page.getByRole('complementary', { name: 'Ready for the kitchen?' })).toBeVisible();
		await tabTo(page, page.getByRole('button', { name: 'Increase Garden salad' }));
		await page.keyboard.press('Enter');
		await expect(page.getByLabel('Quantity 2')).toBeVisible();
		const cartSubmit = page.getByRole('button', { name: 'Submit order' });
		await tabTo(page, cartSubmit);
		await page.keyboard.press('Enter');
		const beveragePrompt = page.getByTestId('beverage-prompt');
		await expect(beveragePrompt).toBeVisible();
		await expect.poll(() => beveragePrompt.evaluate((element) => element.contains(document.activeElement))).toBe(true);
		await page.keyboard.press('Escape');
		await expect(beveragePrompt).toBeHidden();
		await expect(cartSubmit).toBeFocused();
		await expectNoOverflow(page);
	});
}
