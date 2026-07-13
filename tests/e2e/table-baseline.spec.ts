import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

type BrowserSignal = {
	time: string;
	text?: string;
	url?: string;
	method?: string;
	status?: number;
	resourceType?: string;
	failure?: string | null;
	contentType?: string | null;
};

type PageEvidence = {
	host: string;
	viewport: { width: number; height: number } | null;
	status: number | null;
	navigationError: string | null;
	finalUrl: string;
	title: string;
	bodyText: string;
	bodyHtml: string;
	main: {
		count: number;
		visible: boolean;
		box: { x: number; y: number; width: number; height: number } | null;
	};
	bodyStyle: Record<string, string> | null;
	crypto: Record<string, unknown> | null;
	scripts: string[];
	stylesheets: string[];
	console: BrowserSignal[];
	pageErrors: BrowserSignal[];
	requestFailures: BrowserSignal[];
	responsesAtLeast400: BrowserSignal[];
	requiredAssetFailures: BrowserSignal[];
	visibleTable: boolean;
	visibleDish: boolean;
	flowAttempted: boolean;
	flowResult: string | null;
	createdOrderIds: string[];
	screenshot: string;
	trace: string;
};

const token = 'table-one-local';
const artifactRoot = resolve('test-results/artifacts');

function timestamp() {
	return new Date().toISOString();
}

function safeName(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function signalBase(): BrowserSignal {
	return { time: timestamp() };
}

function responseSignal(response: Response): BrowserSignal {
	return {
		...signalBase(),
		url: response.url(),
		method: response.request().method(),
		status: response.status(),
		resourceType: response.request().resourceType(),
		contentType: response.headers()['content-type'] ?? null,
	};
}

async function writeJson(path: string, value: unknown) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

async function readPageState(page: Page) {
	return page.evaluate(() => {
		const mainElements = Array.from(document.querySelectorAll('main'));
		const main = mainElements[0];
		const rect = main?.getBoundingClientRect();
		const style = getComputedStyle(document.body);
		const cryptoValue = globalThis.crypto;
		let randomUuidResult: string | null = null;
		let randomUuidError: string | null = null;
		try {
			randomUuidResult = typeof cryptoValue?.randomUUID === 'function' ? cryptoValue.randomUUID() : null;
		} catch (error) {
			randomUuidError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		}
		return {
			finalUrl: location.href,
			title: document.title,
			bodyText: document.body.innerText,
			bodyHtml: document.body.innerHTML,
			main: {
				count: mainElements.length,
				visible: !!main && !!rect && rect.width > 0 && rect.height > 0,
				box: rect
					? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
					: null,
			},
			bodyStyle: {
				display: style.display,
				visibility: style.visibility,
				opacity: style.opacity,
				color: style.color,
				backgroundColor: style.backgroundColor,
			},
			crypto: {
				isSecureContext: globalThis.isSecureContext,
				cryptoType: typeof cryptoValue,
				randomUUIDType: typeof cryptoValue?.randomUUID,
				randomUuidResult,
				randomUuidError,
			},
			scripts: Array.from(document.scripts).map((script) => script.src || '[inline]'),
			stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
				(link) => (link as HTMLLinkElement).href,
			),
			visibleTable: /Table\s+1/i.test(document.body.innerText),
			visibleDish: /Menyue burger|Seasoned fries|Garden salad/i.test(document.body.innerText),
		};
	});
}

async function collectEvidence(page: Page, testInfo: TestInfo, signals: {
	console: BrowserSignal[];
	pageErrors: BrowserSignal[];
	requestFailures: BrowserSignal[];
	responsesAtLeast400: BrowserSignal[];
	createdOrderIds: string[];
}, navigation: { status: number | null; error: string | null }, flow: {
	attempted: boolean;
	result: string | null;
}) {
	const host = new URL(testInfo.project.use.baseURL ?? process.env.BASE_URL ?? 'http://localhost:5173').hostname;
	const viewport = page.viewportSize();
	const directory = join(artifactRoot, safeName(host), testInfo.project.name);
	await mkdir(directory, { recursive: true });
	const prefix = join(directory, `${safeName(testInfo.title)}-${Date.now()}`);
	const screenshot = `${prefix}.png`;
	const trace = `${prefix}.trace.zip`;
	let state: Awaited<ReturnType<typeof readPageState>> | null = null;
	try {
		state = await readPageState(page);
	} catch (error) {
		flow.result ??= `Could not inspect DOM: ${error instanceof Error ? error.message : String(error)}`;
	}
	try {
		await page.screenshot({ path: screenshot, fullPage: true });
	} catch (error) {
		flow.result ??= `Could not capture screenshot: ${error instanceof Error ? error.message : String(error)}`;
	}
	const requiredAssetFailures = signals.responsesAtLeast400.filter((signal) =>
		['script', 'stylesheet', 'font', 'image'].includes(signal.resourceType ?? ''),
	);
	const evidence: PageEvidence = {
		host,
		viewport,
		status: navigation.status,
		navigationError: navigation.error,
		finalUrl: state?.finalUrl ?? page.url(),
		title: state?.title ?? '',
		bodyText: state?.bodyText ?? '',
		bodyHtml: state?.bodyHtml ?? '',
		main: state?.main ?? { count: 0, visible: false, box: null },
		bodyStyle: state?.bodyStyle ?? null,
		crypto: state?.crypto ?? null,
		scripts: state?.scripts ?? [],
		stylesheets: state?.stylesheets ?? [],
		console: signals.console,
		pageErrors: signals.pageErrors,
		requestFailures: signals.requestFailures,
		responsesAtLeast400: signals.responsesAtLeast400,
		requiredAssetFailures,
		visibleTable: state?.visibleTable ?? false,
		visibleDish: state?.visibleDish ?? false,
		flowAttempted: flow.attempted,
		flowResult: flow.result,
		createdOrderIds: signals.createdOrderIds,
		screenshot,
		trace,
	};
	await writeJson(`${prefix}.json`, evidence);
	await writeJson(join(directory, 'latest.json'), evidence);
	await page.context().tracing.stop({ path: trace });
	return evidence;
}

test('@baseline table page baseline evidence and visible order flow', async ({ page }, testInfo) => {
	const signals = {
		console: [] as BrowserSignal[],
		pageErrors: [] as BrowserSignal[],
		requestFailures: [] as BrowserSignal[],
		responsesAtLeast400: [] as BrowserSignal[],
		createdOrderIds: [] as string[],
	};
	const navigation = { status: null as number | null, error: null as string | null };
	const flow = { attempted: false, result: null as string | null };

	// These listeners and tracing are deliberately installed before navigation.
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error')
			signals.console.push({ ...signalBase(), text: `[${message.type()}] ${message.text()}`, url: page.url() });
	});
	page.on('pageerror', (error) => {
		signals.pageErrors.push({ ...signalBase(), text: `${error.name}: ${error.message}`, url: page.url() });
	});
	page.on('requestfailed', (request) => {
		signals.requestFailures.push({
			...signalBase(),
			url: request.url(),
			method: request.method(),
			resourceType: request.resourceType(),
			failure: request.failure()?.errorText ?? null,
		});
	});
	page.on('response', (response) => {
		if (response.status() >= 400) signals.responsesAtLeast400.push(responseSignal(response));
	});
	await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true });

	try {
		const response = await page.goto(`/t/${token}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		navigation.status = response?.status() ?? null;
	} catch (error) {
		navigation.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	}
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
	await page.waitForTimeout(500);

	let state: Awaited<ReturnType<typeof readPageState>> | null = null;
	try {
		state = await readPageState(page);
	} catch {
		// collectEvidence will preserve the navigation and listener failures.
	}
	if (state?.main.visible && state.visibleTable && state.visibleDish) {
		flow.attempted = true;
		try {
			const burger = page.locator('article').filter({ hasText: 'Menyue burger' }).first();
			await burger.getByRole('button', { name: /^Add/ }).click({ timeout: 5_000 });
			const wizard = page.getByTestId('order-draft');
			const side = wizard.locator('input[type="radio"], input[type="checkbox"]').first();
			if (!(await side.isChecked())) await side.check({ timeout: 5_000 });
			await wizard.getByTestId('draft-next').click();
			const reviewButton = wizard.getByTestId('draft-review');
			await expect(reviewButton).toBeVisible({ timeout: 5_000 });
			await reviewButton.click();
			await wizard.getByTestId('draft-commit').click();
			const orderResponsePromise = page.waitForResponse(
				(response) => response.request().method() === 'POST' && response.url().includes(`/api/tables/${token}/orders`),
				{ timeout: 10_000 },
			);
			await page.getByRole('button', { name: 'Submit' }).first().click({ timeout: 5_000 });
			await page.getByRole('dialog', { name: 'Something to drink?' }).getByRole('button', { name: /No thanks/ }).click();
			const orderResponse = await orderResponsePromise;
			const orderBody = (await orderResponse.json().catch(() => null)) as { order?: { id?: string }; message?: string } | null;
			if (orderBody?.order?.id) signals.createdOrderIds.push(orderBody.order.id);
			await expect(page.getByText('Order sent')).toBeVisible({ timeout: 10_000 });
			flow.result = `Order flow succeeded with HTTP ${orderResponse.status()}.`;
		} catch (error) {
			flow.result = `Order flow failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
		}
	}

	const evidence = await collectEvidence(page, testInfo, signals, navigation, flow);
	if (!evidence.main.visible || !evidence.visibleTable || !evidence.visibleDish) {
		throw new Error(`Baseline defect: table page did not visibly render. Evidence: ${evidence.screenshot}`);
	}
	expect(evidence.status).toBe(200);
	expect(evidence.pageErrors, JSON.stringify(evidence.pageErrors)).toEqual([]);
	expect(evidence.requiredAssetFailures, JSON.stringify(evidence.requiredAssetFailures)).toEqual([]);
	expect(evidence.flowAttempted).toBe(true);
	expect(evidence.flowResult).toContain('succeeded');
});
