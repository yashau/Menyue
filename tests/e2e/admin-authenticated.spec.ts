import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const credentials = { username: 'admin', password: 'menyue-admin-local' };
const viewports = [
	{ width: 320, height: 720 },
	{ width: 360, height: 800 },
	{ width: 375, height: 812 },
	{ width: 390, height: 844 },
	{ width: 412, height: 915 },
	{ width: 768, height: 1024 },
	{ width: 1024, height: 768 },
	{ width: 1440, height: 900 },
] as const;
const evidenceDirectory = resolve('test-results/artifacts/admin-authenticated-matrix');

async function expectNoHorizontalOverflow(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => ({
				client: document.documentElement.clientWidth,
				scroll: document.documentElement.scrollWidth,
			})),
		)
		.toEqual(
			await page.evaluate(() => ({
				client: document.documentElement.clientWidth,
				scroll: document.documentElement.clientWidth,
			})),
		);
}

async function expectMainControlsAccessible(page: Page) {
	const inaccessible = await page.locator('#admin-main').evaluate((main) =>
		Array.from(main.querySelectorAll('input, textarea, button, [role="combobox"]'))
			.filter(
				(element) =>
					!element.matches(
						'input[name="category"], input[name="suggested"], input[name="role"], input[name="mode"]',
					),
			)
			.filter((element) => !['hidden', 'checkbox'].includes((element as HTMLInputElement).type))
			.filter((element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return (
					style.display === 'none' ||
					style.visibility === 'hidden' ||
					element.getAttribute('aria-hidden') === 'true' ||
					rect.width === 0 ||
					rect.height === 0
				);
			})
			.map(
				(element) =>
					`${element.tagName.toLowerCase()}[name="${element.getAttribute('name') ?? ''}"]`,
			),
	);
	expect(inaccessible, 'critical admin form controls must not be hidden or zero-sized').toEqual([]);
}

async function expectPrincipalBoxesContained(page: Page) {
	const violations = await page
		.locator('#admin-main article, #admin-main [data-slot="card"], #admin-main form, #admin-main section')
		.evaluateAll((elements) =>
			elements
				.filter((element) => {
					const style = getComputedStyle(element);
					const rect = element.getBoundingClientRect();
					return (
						style.display !== 'none' &&
						style.visibility !== 'hidden' &&
						rect.width > 0 &&
						(rect.left < -1 || rect.right > window.innerWidth + 1)
					);
				})
				.map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
		);
	expect(violations, 'principal admin cards, toolbars, and forms must fit the viewport').toEqual([]);
}

async function expectDialogContained(page: Page, dialog: ReturnType<Page['getByRole']>) {
	await expect(dialog).toBeVisible();
	await expect
		.poll(() =>
			dialog.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return {
					contained:
						rect.left >= 0 &&
						rect.top >= 0 &&
						rect.right <= window.innerWidth &&
						rect.bottom <= window.innerHeight,
					overflowY: getComputedStyle(element).overflowY,
				};
			}),
		)
		.toEqual({ contained: true, overflowY: 'auto' });
}

async function openAndCloseSelect(page: Page, trigger: ReturnType<Page['getByRole']>) {
	await expect(trigger).toBeVisible();
	await trigger.click();
	await expect(page.locator('[role="listbox"][data-state="open"]')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
}

async function signIn(
	page: Page,
	viewport: (typeof viewports)[number],
	pageErrors: string[],
	failedRequests: string[],
	failedResponses: string[],
) {
	await page.setViewportSize(viewport);
	await page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.on('requestfailed', (request) =>
		failedRequests.push(
			`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'failed'}`,
		),
	);
	await page.on('response', (response) => {
		const url = new URL(response.url());
		if (
			url.origin === new URL(page.url() || 'http://localhost:5173').origin &&
			response.status() >= 400
		)
			failedResponses.push(`${response.status()} ${url.pathname}`);
	});

	await page.goto('/admin/login');
	await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible();
	await page.getByLabel('Username').fill(credentials.username);
	await page.getByLabel('Password').fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
	await expect(page.getByRole('heading', { name: 'Welcome, admin', level: 1 })).toBeVisible();

	const cookies = await page.context().cookies();
	expect(cookies.find((cookie) => cookie.name === 'menyue_session')?.value).toBeTruthy();
	expect(cookies.find((cookie) => cookie.name === 'menyue_csrf')?.value).toBeTruthy();
	expect((await page.request.get('/admin')).status()).toBe(200);

	const trigger = page.getByRole('button', { name: /toggle sidebar/i }).first();
	if (viewport.width < 768) {
		await trigger.click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible();
		await expect(dialog.getByRole('link', { name: 'People', exact: true })).toBeVisible();
		await expect(dialog.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
		await dialog.focus();
		await expect(dialog).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(trigger).toBeFocused();
	} else {
		await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible();
		for (const label of [
			'Overview',
			'Categories',
			'Menu items',
			'Editorial',
			'Tables',
			'People',
			'Settings',
		])
			await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
	}
	await expectNoHorizontalOverflow(page);
}

async function visit(
	page: Page,
	path: string,
	name: string,
	check: () => Promise<void>,
	screenshotNames: string[],
	width: number,
) {
	await page.goto(path);
	await check();
	await expect(page.locator('main, [role="main"]').first()).toBeAttached();
	await expectMainControlsAccessible(page);
	await expectPrincipalBoxesContained(page);
	await expectNoHorizontalOverflow(page);
	await page.screenshot({
		path: resolve(evidenceDirectory, `admin-${width}-${name}.png`),
		fullPage: true,
	});
	screenshotNames.push(`admin-${width}-${name}.png`);
}

for (const viewport of viewports) {
	test(`authenticated admin evidence matrix ${viewport.width}px`, async ({ page }) => {
		const pageErrors: string[] = [];
		const failedRequests: string[] = [];
		const failedResponses: string[] = [];
		const visited: string[] = [];
		const screenshotNames: string[] = [];
		await mkdir(evidenceDirectory, { recursive: true });
		await signIn(page, viewport, pageErrors, failedRequests, failedResponses);

		await visit(
			page,
			'/admin',
			'dashboard',
			async () => {
				await expect(page.getByRole('heading', { name: 'Menu at a glance', level: 2 })).toBeVisible();
				await expect(page.getByRole('heading', { name: 'Open order queue', level: 2 })).toBeVisible();
				await expect(page.getByRole('link', { name: /open counter/i })).toHaveAttribute('href', '/counter');
				visited.push('/admin');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/hero',
			'hero-uploads',
			async () => {
				await expect(page.getByRole('heading', { name: 'Hero content', level: 1 })).toBeVisible();
				await expect(page.locator('form[action$="?/save"]')).toHaveAttribute(
					'enctype',
					'multipart/form-data',
				);
				await expect(page.locator('input[type="file"][name="photo"]')).toBeAttached();
				await expect(page.getByRole('button', { name: 'Save hero' })).toBeVisible();
				visited.push('/admin/hero');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/menu/categories',
			'categories',
			async () => {
				await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible();
				const summaries = page.locator('[aria-label="Category summaries"] article');
				await expect(summaries).toHaveCount(3);
				for (const label of ['Starters', 'Mains', 'Drinks'])
					await expect(summaries.filter({ hasText: label })).toHaveCount(1);
				await expect(page.getByRole('button', { name: 'Create category' })).toBeVisible();
				await expect(page.locator('[role="dialog"] form')).toHaveCount(0);
				const startersEdit = summaries
					.filter({ has: page.getByRole('heading', { name: 'Starters', level: 2 }) })
					.getByRole('button', { name: 'Edit' });
				await startersEdit.click();
				const dialog = page.getByRole('dialog', { name: 'Edit Starters' });
				await expectDialogContained(page, dialog);
				await expect(dialog.locator('form[action$="?/update"] input[name="name"]')).toHaveValue(
					'Starters',
				);
				await expect(dialog.locator('input[readonly]')).toHaveValue('STARTERS');
				await expect(dialog.locator('form[action$="?/archive"]')).toHaveCount(1);
				await page.keyboard.press('Escape');
				await expect(dialog).toBeHidden();
				await expect(startersEdit).toBeFocused();
				expect(await page.locator('form[action$="?/move"]').count()).toBeGreaterThanOrEqual(3);
				visited.push('/admin/menu/categories');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/menu/items',
			'items-modifiers-suggestions',
			async () => {
				await expect(page.getByRole('heading', { name: 'Menu items', level: 1 })).toBeVisible();
				await expect(page.getByRole('heading', { name: 'Seasoned fries', level: 2 })).toBeVisible();
				await expect(page.getByRole('heading', { name: 'Menyue burger', level: 2 })).toBeVisible();
				await expect(page.locator('[role="dialog"] form')).toHaveCount(0);
				const burgerEdit = page
					.locator('article')
					.filter({ has: page.getByRole('heading', { name: 'Menyue burger', level: 2 }) })
					.getByRole('button', { name: 'Edit' });
				await burgerEdit.click();
				const dialog = page.getByRole('dialog', { name: 'Edit Menyue burger' });
				await expectDialogContained(page, dialog);
				await expect(dialog.locator('form[action$="?/save"] input[name="name"]')).toHaveValue(
					'Menyue burger',
				);
				await expect(dialog.locator('form[action$="?/promotion"] input[name="label"]')).toHaveValue(
					'Lunch offer',
				);
				await expect(dialog.locator('form[action$="?/groupEdit"] input[name="name"]')).toHaveValue(
					'Choose a side',
				);
				await dialog.getByText('Suggestions', { exact: true }).click();
				for (const action of [
					'?/save',
					'?/promotion',
					'?/group',
					'?/groupEdit',
					'?/choice',
					'?/choiceEdit',
					'?/suggestion',
				])
					expect(
						await dialog.locator(`form[action$="${action}"]`).count(),
						`${action} action`,
					).toBeGreaterThan(0);
				await openAndCloseSelect(
					page,
					dialog.getByRole('button', { name: 'Category', exact: true }),
				);
				await openAndCloseSelect(
					page,
					dialog.getByRole('button', { name: 'Suggested item', exact: true }),
				);
				await page.keyboard.press('Escape');
				await expect(dialog).toBeHidden();
				await expect(burgerEdit).toBeFocused();
				visited.push('/admin/menu/items');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/tables',
			'tables-tokens',
			async () => {
				await expect(
					page.getByRole('heading', { name: 'Tables & QR tokens', level: 1 }),
				).toBeVisible();
				await expect(page.getByText('Table 1', { exact: true })).toBeVisible();
				await expect(page.getByText('Token ending e-local', { exact: true })).toBeVisible();
				await expect(page.getByRole('button', { name: 'Rotate token' })).toBeVisible();
				await expect(page.locator('form[action$="?/create"] input[name="label"]')).toBeVisible();
				visited.push('/admin/tables');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/users',
			'users-permissions',
			async () => {
				await expect(page.getByRole('heading', { name: 'Users & roles', level: 1 })).toBeVisible();
				for (const label of ['Local administrator', 'Local manager'])
					await expect(page.getByText(label, { exact: true })).toBeVisible();
				expect(await page.locator('form[action$="?/update"]').count()).toBeGreaterThanOrEqual(2);
				expect(await page.locator('form[action$="?/reset"]').count()).toBeGreaterThanOrEqual(2);
				await openAndCloseSelect(
					page,
					page.getByRole('button', { name: 'Role', exact: true }).first(),
				);
				visited.push('/admin/users');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/settings',
			'settings-currency-beverages',
			async () => {
				await expect(
					page.getByRole('heading', { name: 'Currency & display', level: 1 }),
				).toBeVisible();
				await expect(page.locator('[name="baseCurrency"]')).toHaveValue('USD');
				for (const code of ['USD', 'EUR', 'GBP'])
					await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
				await expect(page.getByText('Final drinks prompt', { exact: true })).toBeVisible();
				await expect(page.locator('input[name="heading"]')).toHaveValue('Something to drink?');
				await expect(page.locator('body')).not.toContainText('MVR');
				for (const action of ['?/save', '?/sync', '?/currency', '?/beverage'])
					expect(
						await page.locator(`form[action$="${action}"]`).count(),
						`${action} action`,
					).toBeGreaterThan(0);
				await openAndCloseSelect(
					page,
					page.getByRole('button', { name: 'Rate source', exact: true }),
				);
				visited.push('/admin/settings');
			},
			screenshotNames,
			viewport.width,
		);

		await visit(
			page,
			'/admin/change-password',
			'change-password',
			async () => {
				await expect(
					page.getByRole('heading', { name: 'Choose a new password', level: 1 }),
				).toBeVisible();
				const form = page.locator('form').first();
				await expect(form).toHaveAttribute('method', 'POST');
				const password = page.getByLabel('New password');
				const confirm = page.getByLabel('Confirm password');
				await password.fill('temporary-local-password');
				await confirm.fill('temporary-local-password');
				await password.fill('');
				await confirm.fill('');
				visited.push('/admin/change-password');
			},
			screenshotNames,
			viewport.width,
		);

		const unexpectedFailedRequests = failedRequests.filter(
			(request) => !request.endsWith(': net::ERR_ABORTED'),
		);
		await writeFile(
			resolve(evidenceDirectory, `admin-${viewport.width}-evidence.json`),
			JSON.stringify(
				{
					viewport,
					authenticated: true,
					sessionCookies: ['menyue_session', 'menyue_csrf'],
					visited,
					screenshots: screenshotNames,
					pageErrors,
					failedRequests,
					expectedNavigationAborts: failedRequests.filter((request) =>
						request.endsWith(': net::ERR_ABORTED'),
					),
					failedResponses,
				},
				null,
				2,
			) + '\n',
			'utf8',
		);
		expect(pageErrors, 'uncaught browser errors').toEqual([]);
		expect(unexpectedFailedRequests, 'unexpected failed network requests').toEqual([]);
		expect(failedResponses, 'failed same-origin responses').toEqual([]);
	});
}
