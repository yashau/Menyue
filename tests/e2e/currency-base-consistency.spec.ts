import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const credentials = { username: 'admin', password: 'menyue-admin-local' };
const root = resolve('.');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');

type CurrencyRow = {
	currency_code: string;
	minor_unit: number;
	locale: string;
	is_base: number;
	rate_mode: string;
};

type CurrencyState = {
	restaurant: {
		currency: string;
		currency_minor_unit: number;
		currency_locale: string;
		money_revision: number;
		rate_revision: number;
		menu_revision: number;
	};
	currencies: CurrencyRow[];
	cachedRates: Array<{ base_currency: string; quote_currency: string }>;
};

function query<T>(sql: string): T[] {
	const output = execFileSync(
		process.execPath,
		[
			wrangler,
			'd1',
			'execute',
			'menyue',
			'--local',
			'--persist-to',
			'.wrangler/state',
			'--command',
			sql,
			'--json',
		],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false },
	);
	const result = JSON.parse(output) as Array<{ success: boolean; results: T[] }>;
	if (!result[0]?.success) throw new Error(`Unable to query local D1: ${sql}`);
	return result[0].results;
}

function state(): CurrencyState {
	const [restaurant] = query<CurrencyState['restaurant']>(
		"SELECT currency,currency_minor_unit,currency_locale,money_revision,rate_revision,menu_revision FROM restaurants WHERE id='demo'",
	);
	if (!restaurant) throw new Error('Local demo restaurant fixture is missing.');
	return {
		restaurant,
		currencies: query<CurrencyRow>(
			"SELECT currency_code,minor_unit,locale,is_base,rate_mode FROM restaurant_currencies WHERE restaurant_id='demo' ORDER BY currency_code",
		),
		cachedRates: query(
			"SELECT base_currency,quote_currency FROM currency_rate_sync WHERE restaurant_id='demo' ORDER BY quote_currency",
		),
	};
}

function expectCoordinatedRevisionChange(next: CurrencyState, previous: CurrencyState) {
	const money = next.restaurant.money_revision - previous.restaurant.money_revision;
	expect(money).toBe(1);
	expect(next.restaurant.rate_revision - previous.restaurant.rate_revision).toBe(money);
	expect(next.restaurant.menu_revision - previous.restaurant.menu_revision).toBe(money);
}

async function signIn(page: Page) {
	await page.goto('/admin/login');
	await page.getByLabel('Username').fill(credentials.username);
	await page.getByLabel('Password').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

async function makeBase(page: Page, code: string) {
	const form = page.locator(`form[action="?/makeBase"]:has(input[name="code"][value="${code}"])`);
	await form.getByLabel(`Type ${code} to confirm`).fill(code);
	await form.getByRole('button', { name: 'Make base' }).click();
	await page.goto('/admin/settings');
	await expect(page.getByLabel('Base currency')).toHaveValue(code);
}

test.afterEach(() => {
	// This focused test deliberately promotes each fixture currency. Re-seed so later e2e
	// cases always receive USD/en-US with EUR and GBP quotes, including the cached GBP rate.
	execFileSync(process.execPath, [resolve(root, 'scripts/setup-local.mjs')], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
	});
});

test('base currency changes are coordinated and normal settings saves cannot mutate them', async ({
	page,
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'Run once because this test temporarily changes the shared local fixture.',
	);
	await signIn(page);
	await page.goto('/admin/settings');
	await expect(page.getByLabel('Base currency')).toHaveAttribute('readonly', '');

	const initial = state();
	expect(initial.restaurant).toMatchObject({
		currency: 'USD',
		currency_minor_unit: 2,
		currency_locale: 'en-US',
	});
	expect(initial.currencies).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ currency_code: 'USD', minor_unit: 2, locale: 'en-US', is_base: 1 }),
			expect.objectContaining({ currency_code: 'EUR', minor_unit: 2, locale: 'en-IE', is_base: 0 }),
			expect.objectContaining({ currency_code: 'GBP', minor_unit: 2, locale: 'en-GB', is_base: 0 }),
		]),
	);

	await page.getByRole('button', { name: 'Save publishing settings' }).click();
	await expect(page.getByText('Settings saved.')).toBeVisible();
	expect(state()).toEqual(initial);

	const baseCurrency = page.getByLabel('Base currency');
	await baseCurrency.evaluate((input) => input.removeAttribute('readonly'));
	await baseCurrency.fill('EUR');
	const tamperedSave = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('/admin/settings'),
	);
	await page.getByRole('button', { name: 'Save publishing settings' }).click();
	expect((await tamperedSave).status()).toBe(400);
	await expect(page.getByRole('alert')).toHaveText(
		'Change the restaurant base currency with the confirmed Make base action below.',
	);
	expect(state()).toEqual(initial);

	await makeBase(page, 'EUR');
	const eurState = state();
	expect(eurState.restaurant).toMatchObject({
		currency: 'EUR',
		currency_minor_unit: 2,
		currency_locale: 'en-IE',
	});
	expect(eurState.currencies).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				currency_code: 'EUR',
				minor_unit: 2,
				locale: 'en-IE',
				is_base: 1,
				rate_mode: 'fixed',
			}),
		]),
	);
	expect(eurState.cachedRates).toEqual([]);
	expectCoordinatedRevisionChange(eurState, initial);
	expect(eurState.currencies.filter((currency) => currency.is_base === 1)).toEqual([
		expect.objectContaining({ currency_code: 'EUR' }),
	]);

	await makeBase(page, 'GBP');
	const gbpState = state();
	expect(gbpState.restaurant).toMatchObject({
		currency: 'GBP',
		currency_minor_unit: 2,
		currency_locale: 'en-GB',
	});
	expect(gbpState.currencies).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ currency_code: 'GBP', is_base: 1, rate_mode: 'fixed' }),
		]),
	);
	expect(gbpState.cachedRates).toEqual([]);
	expectCoordinatedRevisionChange(gbpState, eurState);
	expect(gbpState.currencies.filter((currency) => currency.is_base === 1)).toEqual([
		expect.objectContaining({ currency_code: 'GBP' }),
	]);

	await makeBase(page, 'USD');
	const restoredBase = state();
	expect(restoredBase.restaurant).toMatchObject({
		currency: 'USD',
		currency_minor_unit: 2,
		currency_locale: 'en-US',
	});
	expect(restoredBase.currencies).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ currency_code: 'USD', is_base: 1, rate_mode: 'fixed' }),
		]),
	);
	expect(restoredBase.cachedRates).toEqual([]);
	expectCoordinatedRevisionChange(restoredBase, gbpState);
	expect(restoredBase.currencies.filter((currency) => currency.is_base === 1)).toEqual([
		expect.objectContaining({ currency_code: 'USD' }),
	]);
});
