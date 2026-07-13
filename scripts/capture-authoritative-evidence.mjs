import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { Socket } from 'node:net';
import { chromium } from '@playwright/test';

const root = resolve('.');
const artifactRoot = resolve(root, 'test-results/artifacts/authoritative');
const stateDirectory = resolve(root, '.wrangler/state');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const token = 'table-one-local';
const routes = [
	{ name: 'customer-menu', path: '/', searchLabel: 'Search menu', requiresTable: false },
	{ name: 'table', path: `/t/${token}`, searchLabel: 'Search dishes', requiresTable: true },
];
const widths = [320, 768, 1440];
const staleTerms = /MVR|Maldives|Rufiyaa/gi;
const requiredProbePaths = [
	'/',
	`/t/${token}`,
	'/api/menu',
	'/menu/menyue-burger.png',
	'/media/local-asset-seasoned-fries',
	'/media/static?src=%2Fmenu%2Fgarden-salad.png',
];

const timestamp = () => new Date().toISOString();
const safeName = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, '_');
const writeJson = (path, value) => {
	mkdirSync(resolve(path, '..'), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
};
const errorText = (error) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

function isPrivateIPv4(address) {
	const [first, second] = address.split('.').map(Number);
	return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function privateAddresses() {
	const addresses = new Set();
	for (const entries of Object.values(networkInterfaces()))
		for (const entry of entries ?? [])
			if (entry.family === 'IPv4' && !entry.internal && isPrivateIPv4(entry.address)) addresses.add(entry.address);
	return [...addresses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function tcpProbe(address, port) {
	const startedAt = Date.now();
	return await new Promise((resolveProbe) => {
		const socket = new Socket();
		let settled = false;
		const finish = (reachable, error = null) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolveProbe({ address, port, reachable, error, elapsedMs: Date.now() - startedAt });
		};
		socket.setTimeout(2_500);
		socket.once('connect', () => finish(true));
		socket.once('timeout', () => finish(false, 'timeout'));
		socket.once('error', (error) => finish(false, `${error.code ?? error.name}: ${error.message}`));
		socket.connect(port, address);
	});
}

async function fetchResponse(baseUrl, path, options = {}) {
	const startedAt = Date.now();
	try {
		const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(20_000) });
		return {
			path, status: response.status, ok: response.ok, contentType: response.headers.get('content-type'),
			bytes: Number(response.headers.get('content-length') ?? 0) || null, elapsedMs: Date.now() - startedAt,
		};
	} catch (error) {
		return { path, status: null, ok: false, contentType: null, bytes: null, elapsedMs: Date.now() - startedAt, error: errorText(error) };
	}
}

async function probeHost(baseUrl) {
	const responses = [];
	for (const path of requiredProbePaths) responses.push(await fetchResponse(baseUrl, path));
	return { baseUrl, reachable: responses[1]?.status === 200, responses };
}

function d1(command) {
	const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'menyue', '--local', '--persist-to', stateDirectory, '--command', command, '--json'], {
		cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false,
	});
	const result = JSON.parse(output);
	if (!result[0]?.success) throw new Error(`Local D1 command failed: ${command}`);
	return result[0].results;
}

function staleHits(value) {
	return [...new Set(value.match(staleTerms) ?? [])];
}

function scanArtifactText(directory) {
	const hits = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) hits.push(...scanArtifactText(path));
		else if (entry.name.endsWith('.json')) {
			const terms = staleHits(readFileSync(path, 'utf8'));
			if (terms.length) hits.push({ path, terms });
		}
	}
	return hits;
}

async function safely(target, action, failures) {
	try { return await action(); } catch (error) { failures.push({ target, error: errorText(error), time: timestamp() }); return null; }
}

async function capturePage(browser, host, route, width) {
	const page = await browser.newPage({ viewport: { width, height: width < 500 ? 860 : 960 }, locale: 'en-US' });
	const interactionErrors = [];
	const signals = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [], httpErrors: [] };
	page.on('console', (message) => {
		const entry = { type: message.type(), text: message.text(), url: page.url(), time: timestamp() };
		if (message.type() === 'error') signals.consoleErrors.push(entry);
		if (message.type() === 'warning') signals.consoleWarnings.push(entry);
	});
	page.on('pageerror', (error) => signals.pageErrors.push({ text: errorText(error), url: page.url(), time: timestamp() }));
	page.on('requestfailed', (request) => signals.requestFailures.push({ url: request.url(), method: request.method(), resourceType: request.resourceType(), failure: request.failure()?.errorText ?? null, time: timestamp() }));
	page.on('response', (response) => { if (response.status() >= 400) signals.httpErrors.push({ url: response.url(), status: response.status(), resourceType: response.request().resourceType(), time: timestamp() }); });

	let navigationStatus = null;
	let navigationError = null;
	try {
		const response = await page.goto(`${host.baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		navigationStatus = response?.status() ?? null;
		// The realtime connection remains intentionally open, so networkidle would
		// add a timeout to every matrix cell without proving additional readiness.
		await page.waitForTimeout(500);
	} catch (error) { navigationError = errorText(error); }
	await page.waitForTimeout(250);

	const selector = page.getByTestId('currency-selector');
	const currency = { count: await selector.count(), buttons: [], checks: {}, selected: null };
	if (currency.count === 1) {
		const buttons = selector.getByRole('button');
		for (let index = 0; index < await buttons.count(); index += 1) {
			const button = buttons.nth(index);
			currency.buttons.push({ code: (await button.innerText()).trim(), label: await button.getAttribute('aria-label') });
		}
		for (const code of ['USD', 'EUR', 'GBP']) {
			const button = buttons.filter({ hasText: code });
			const count = await button.count();
			if (count === 1) {
				await safely(`currency:${code}`, () => button.click(), interactionErrors);
				currency.checks[code] = (await button.getAttribute('aria-pressed')) === 'true';
				if (currency.checks[code]) currency.selected = code;
			} else currency.checks[code] = false;
		}
	}

	const tools = page.getByTestId('customer-menu-tools');
	const search = tools.getByRole('textbox', { name: route.searchLabel });
	const categoryRail = tools.getByRole('navigation', { name: 'Menu categories' });
	const controls = {
		tools: (await tools.count()) === 1,
		searchVisible: (await search.count()) === 1 && await search.isVisible().catch(() => false),
		categoryRailVisible: (await categoryRail.count()) === 1 && await categoryRail.isVisible().catch(() => false),
		categoryLinks: await categoryRail.getByRole('link').count(),
		currencyVisible: currency.count === 1 && await selector.isVisible().catch(() => false),
		noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth).catch(() => false),
	};
	const dom = await page.evaluate((requiresTable) => {
		const mainElement = document.querySelector('main');
		const rect = mainElement?.getBoundingClientRect();
		const text = document.body.innerText;
		return { url: location.href, title: document.title, bodyText: text, bodyHtml: document.body.innerHTML, mainCount: document.querySelectorAll('main').length, mainVisible: Boolean(mainElement && rect && rect.width > 0 && rect.height > 0), visibleDish: /Menyue burger|Seasoned fries|Garden salad/i.test(text), visibleTable: /Table\s+1/i.test(text), requiresTable, scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth };
	}, route.requiresTable).catch((error) => ({ evaluationError: errorText(error), bodyText: '', bodyHtml: '', mainCount: 0, mainVisible: false, visibleDish: false, visibleTable: false, requiresTable: route.requiresTable }));
	const directory = join(artifactRoot, safeName(host.name), route.name, String(width));
	const screenshot = join(directory, 'page.png');
	await safely('screenshot', () => page.screenshot({ path: screenshot, fullPage: true }), interactionErrors);
	const evidence = { capturedAt: timestamp(), host: host.name, baseUrl: host.baseUrl, route: route.path, width, viewport: { width, height: width < 500 ? 860 : 960 }, navigation: { status: navigationStatus, error: navigationError }, controls, currency, dom: { ...dom, staleTermHits: [...new Set([...staleHits(dom.bodyText ?? ''), ...staleHits(dom.bodyHtml ?? '')])] }, signals, interactionErrors, screenshot };
	writeJson(join(directory, 'evidence.json'), evidence);
	await page.close();
	return evidence;
}

async function captureOrderingFlow(browser, host) {
	const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'en-US' });
	const signals = { consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] };
	page.on('console', (message) => { if (message.type() === 'error') signals.consoleErrors.push(message.text()); });
	page.on('pageerror', (error) => signals.pageErrors.push(errorText(error)));
	page.on('requestfailed', (request) => signals.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
	page.on('response', (response) => { if (response.status() >= 400) signals.httpErrors.push(`${response.status()} ${response.url()}`); });
	const result = { capturedAt: timestamp(), host: host.name, baseUrl: host.baseUrl, width: 1440, navigationStatus: null, navigationError: null, modifier: false, suggestion: false, beveragePrompt: false, note: false, cart: false, submissionCount: 0, signals, error: null };
	try {
		const response = await page.goto(`${host.baseUrl}/t/${token}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		await page.waitForTimeout(500);
		result.navigationStatus = response?.status() ?? null;
		await page.getByTestId('add-local-item-burger').click(); await page.getByTestId('choice-local-choice-salad').check(); result.modifier = true;
		await page.getByTestId('draft-next').click(); await page.getByTestId('suggestion-add-local-item-water').click(); result.suggestion = true;
		await page.getByTestId('choice-local-choice-water-room').check(); await page.getByTestId('draft-next').click(); await page.getByTestId('draft-review').click();
		const note = page.getByLabel('Note for Menyue burger'); await note.fill('No onions, please.'); result.note = (await note.inputValue()) === 'No onions, please.' && (await page.getByTestId('draft-review-lines').innerText()).includes('No onions, please.');
		await page.getByTestId('draft-commit').click(); await page.getByTestId('cart-open').click(); result.cart = (await page.locator('.cart-sheet').count()) === 1 && (await page.locator('.cart-sheet').innerText()).includes('Lime water');
		await page.goto(`${host.baseUrl}/t/${token}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }); await page.waitForTimeout(500); await page.getByTestId('add-local-item-fries').click(); await page.getByTestId('draft-commit').click(); await page.getByTestId('submit-order').click(); result.beveragePrompt = await page.getByTestId('beverage-prompt').isVisible(); await page.keyboard.press('Escape');
	} catch (error) { result.error = errorText(error); if (!result.navigationError && result.navigationStatus === null) result.navigationError = result.error; }
	const directory = join(artifactRoot, safeName(host.name), 'table', 'ordering-flow');
	writeJson(join(directory, 'flow.json'), result);
	try { await page.screenshot({ path: join(directory, 'flow.png'), fullPage: true }); } catch (error) { result.error ??= errorText(error); }
	await page.close();
	return result;
}

async function proveIdempotency(baseUrl) {
	const key = randomUUID();
	const sequenceBefore = Number(d1("SELECT next_number FROM order_sequences WHERE restaurant_id='demo'")[0]?.next_number ?? 1);
	let createdOrderId = null; let firstStatus = null; let replayStatus = null; let replayBody = null; let firstBody = null; let cleanupError = null;
	try {
		const payload = { idempotencyKey: key, note: 'authoritative evidence probe', lines: [{ itemId: 'local-item-burger', quantity: 1, choiceIds: ['local-choice-salad'], note: 'evidence note' }] };
		const first = await fetch(`${baseUrl}/api/tables/${token}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) }); firstStatus = first.status; firstBody = await first.json(); createdOrderId = firstBody?.order?.id ?? null;
		const replay = await fetch(`${baseUrl}/api/tables/${token}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) }); replayStatus = replay.status; replayBody = await replay.json();
	} catch (error) { cleanupError = `probe: ${errorText(error)}`; }
	finally {
		try {
			if (createdOrderId && /^[0-9a-f-]{36}$/i.test(createdOrderId)) { const id = `'${createdOrderId}'`; d1(`DELETE FROM order_line_choices WHERE line_id IN (SELECT id FROM order_lines WHERE order_id=${id}); DELETE FROM order_events WHERE order_id=${id}; DELETE FROM order_lines WHERE order_id=${id}; DELETE FROM order_money_snapshots WHERE order_id=${id}; DELETE FROM orders WHERE id=${id}; UPDATE order_sequences SET next_number=${sequenceBefore} WHERE restaurant_id='demo';`); }
		} catch (error) { cleanupError = `cleanup: ${errorText(error)}`; }
	}
	const remaining = createdOrderId ? Number(d1(`SELECT COUNT(*) AS count FROM orders WHERE id='${createdOrderId}'`)[0]?.count ?? 0) : null;
	return { capturedAt: timestamp(), baseUrl, idempotencyKey: key, firstStatus, replayStatus, createdOrderId, replayId: replayBody?.order?.id ?? null, replayMatches: Boolean(createdOrderId && replayBody?.order?.id === createdOrderId), idempotent: Boolean(replayBody?.idempotent), duplicateCount: remaining, cleaned: remaining === 0, cleanupError, firstBody };
}

async function measureTopology(privateCandidates) {
	const lan5173 = await Promise.all(privateCandidates.map((address) => tcpProbe(address, 5173)));
	const lan8788 = await Promise.all(privateCandidates.map((address) => tcpProbe(address, 8788)));
	const lan4173 = await Promise.all(privateCandidates.map((address) => tcpProbe(address, 4173)));
	const loopback = { '5173': await tcpProbe('127.0.0.1', 5173), '8788': await tcpProbe('127.0.0.1', 8788), '4173': await tcpProbe('127.0.0.1', 4173) };
	const failures = [
		...(loopback['5173'].reachable ? [] : [{ expected: '5173 loopback open', measurement: loopback['5173'] }]),
		...(loopback['8788'].reachable ? [] : [{ expected: '8788 loopback open', measurement: loopback['8788'] }]),
		...(loopback['4173'].reachable ? [{ expected: '4173 closed', measurement: loopback['4173'] }] : []),
		...lan5173.filter((probe) => !probe.reachable).map((measurement) => ({ expected: '5173 LAN open', measurement })),
		...lan8788.filter((probe) => probe.reachable).map((measurement) => ({ expected: '8788 LAN closed', measurement })),
		...lan4173.filter((probe) => probe.reachable).map((measurement) => ({ expected: '4173 LAN closed', measurement })),
	];
	return { measuredAt: timestamp(), expected: { publicRuntime: '5173 reachable on loopback and every private LAN address', realtime: '8788 reachable on loopback and unreachable on private LAN addresses', preview: '4173 closed on loopback and private LAN addresses' }, loopback, lan: { '5173': lan5173, '8788': lan8788, '4173': lan4173 }, healthy: privateCandidates.length > 0 && failures.length === 0, failures };
}

const startedAt = timestamp();
rmSync(artifactRoot, { recursive: true, force: true }); mkdirSync(artifactRoot, { recursive: true });
const privateCandidates = privateAddresses();
const candidateUrls = ['http://localhost:5173', ...privateCandidates.map((address) => `http://${address}:5173`)];
const probes = await Promise.all(candidateUrls.map(probeHost));
const reachable = probes.filter((probe) => probe.reachable).map((probe) => ({ name: new URL(probe.baseUrl).hostname, baseUrl: probe.baseUrl }));
const topology = await measureTopology(privateCandidates);
const pages = []; const flows = [];
let captureError = null;
if (reachable.length) {
	const browser = await chromium.launch({ headless: true });
	try { for (const host of reachable) { for (const route of routes) for (const width of widths) pages.push(await capturePage(browser, host, route, width)); flows.push(await captureOrderingFlow(browser, host)); } }
	catch (error) { captureError = errorText(error); }
	finally { await browser.close(); }
} else captureError = 'No reachable Menyue host was found at port 5173.';
let idempotency;
try { idempotency = await proveIdempotency('http://localhost:5173'); } catch (error) { idempotency = { error: errorText(error), idempotent: false, replayMatches: false, duplicateCount: null, cleaned: false }; }

const routeProbeFailures = probes.flatMap((probe) => probe.responses.filter((response) => !response.ok).map((response) => ({ baseUrl: probe.baseUrl, ...response })));
const pageFailures = pages.flatMap((page) => {
	const failures = [];
	if (page.navigation.status !== 200 || page.navigation.error) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'navigation', value: page.navigation });
	if (!page.dom.mainVisible || page.dom.mainCount !== 1) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'main-content' });
	if (!page.dom.visibleDish || (page.dom.requiresTable && !page.dom.visibleTable)) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'visible-dish-or-table-content' });
	if (!page.controls.tools || !page.controls.searchVisible || !page.controls.categoryRailVisible || page.controls.categoryLinks < 1 || !page.controls.currencyVisible) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'customer-controls', value: page.controls });
	if (!page.controls.noHorizontalOverflow) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'horizontal-overflow' });
	if (!page.currency.checks.USD || !page.currency.checks.EUR || !page.currency.checks.GBP) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'currency-coverage', value: page.currency });
	if (page.interactionErrors.length) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'control-interaction', value: page.interactionErrors });
	if (page.dom.staleTermHits.length) failures.push({ host: page.host, route: page.route, width: page.width, gate: 'stale-terms', value: page.dom.staleTermHits });
	for (const [kind, entries] of Object.entries(page.signals)) if (kind !== 'consoleWarnings' && entries.length) failures.push({ host: page.host, route: page.route, width: page.width, gate: `browser-${kind}`, value: entries });
	return failures;
});
const flowFailures = flows.filter((flow) => flow.error || flow.navigationStatus !== 200 || flow.navigationError || !flow.modifier || !flow.suggestion || !flow.beveragePrompt || !flow.note || !flow.cart || flow.submissionCount !== 0 || Object.values(flow.signals).some((entries) => entries.length)).map((flow) => ({ host: flow.host, error: flow.error, flags: flow }));
const staleArtifactHits = [...new Set(pages.flatMap((page) => page.dom.staleTermHits))];
const artifactStaleScan = scanArtifactText(artifactRoot);
const expectedPageCount = candidateUrls.length * routes.length * widths.length;
const expectedFlowCount = candidateUrls.length;
const gates = {
	topology: topology.healthy, hostInventory: reachable.length === candidateUrls.length, routeAndMediaProbes: routeProbeFailures.length === 0, pageMatrix: pages.length === expectedPageCount, pageEvidence: pageFailures.length === 0, orderingFlows: flows.length === expectedFlowCount && flowFailures.length === 0, idempotency: idempotency.firstStatus === 200 && idempotency.replayStatus === 200 && idempotency.replayMatches && idempotency.idempotent && idempotency.duplicateCount === 0 && idempotency.cleaned && idempotency.cleanupError === null, staleTerms: staleArtifactHits.length === 0 && artifactStaleScan.length === 0, capture: !captureError,
};
	const manifest = {
	status: Object.values(gates).every(Boolean) ? 'authoritative' : 'failed', authoritative: Object.values(gates).every(Boolean), startedAt, completedAt: timestamp(), fixture: { baseCurrency: 'USD', locale: 'en-US', displayAlternates: ['EUR', 'GBP'], tableRoute: `/t/${token}` }, widths, routes: routes.map(({ name, path }) => ({ name, path })), gates, hostInventory: { privateCandidates, expectedHosts: candidateUrls, probes, reachable: reachable.map((host) => host.baseUrl), unreachable: probes.filter((probe) => !probe.reachable), staleAddressInventory: topology.failures }, listenerTopology: topology, counts: { hosts: reachable.length, expectedHosts: candidateUrls.length, routes: routes.length, widths: widths.length, pageEvidence: pages.length, expectedPageEvidence: expectedPageCount, orderingFlows: flows.length, expectedOrderingFlows: expectedFlowCount }, pages: pages.map((page) => ({ host: page.host, baseUrl: page.baseUrl, route: page.route, width: page.width, evidence: join(artifactRoot, safeName(page.host), page.route === '/' ? 'customer-menu' : 'table', String(page.width), 'evidence.json'), screenshot: page.screenshot, navigation: page.navigation, controls: page.controls, currency: page.currency, staleTermHits: page.dom.staleTermHits, errorCounts: { console: page.signals.consoleErrors.length, page: page.signals.pageErrors.length, request: page.signals.requestFailures.length, http: page.signals.httpErrors.length } })), orderingFlows: flows, idempotency, artifactStaleScan, failures: { captureError, routeProbeFailures, pageFailures, flowFailures, staleArtifactHits }, errorCounts: { console: pages.reduce((sum, page) => sum + page.signals.consoleErrors.length, 0), page: pages.reduce((sum, page) => sum + page.signals.pageErrors.length, 0), request: pages.reduce((sum, page) => sum + page.signals.requestFailures.length, 0), http: pages.reduce((sum, page) => sum + page.signals.httpErrors.length, 0) }, staleTermHits: staleArtifactHits,
};
manifest.manifestIntegrity = { statusIsDerivedFromEveryGate: manifest.authoritative === Object.values(manifest.gates).every(Boolean), statusAgreesWithAuthoritativeFlag: manifest.status === (manifest.authoritative ? 'authoritative' : 'failed') };
writeJson(join(artifactRoot, 'manifest.json'), manifest);
console.log(JSON.stringify(manifest, null, 2));
if (!manifest.authoritative) process.exitCode = 1;
