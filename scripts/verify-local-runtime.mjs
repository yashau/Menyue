import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve('.');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const stateDirectory = '.wrangler/state';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const createdKey = '5d1b2fb2-0cd8-4ca4-9d1b-8d3a1a9f4944';
let dev;
let createdOrderId;
let sequenceBefore;

function assert(value, message) {
	if (!value) throw new Error(message);
}

function privateLanAddress() {
	for (const entries of Object.values(networkInterfaces()))
		for (const entry of entries ?? []) {
			if (entry.family !== 'IPv4' || entry.internal) continue;
			const [first, second] = entry.address.split('.').map(Number);
			if (first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168))
				return entry.address;
		}
	return undefined;
}

function d1(command) {
	const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'menyue', '--local', '--persist-to', stateDirectory, '--command', command, '--json'], {
		cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false,
	});
	const result = JSON.parse(output);
	assert(result[0]?.success, 'Local D1 command failed.');
	return result[0].results;
}

async function stopDev() {
	if (!dev || dev.exitCode !== null) return;
	const exited = new Promise((resolve) => dev.once('exit', resolve));
	dev.send({ type: 'shutdown' });
	await Promise.race([exited, sleep(15_000)]);
	if (dev.exitCode === null && process.platform === 'win32')
		await new Promise((resolve) => execFile('taskkill', ['/pid', String(dev.pid), '/T', '/F'], () => resolve()));
	await Promise.race([exited, sleep(5_000)]);
}

async function waitFor(base) {
	const deadline = Date.now() + 180_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${base}/`, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
			if (response.status === 200) return;
		} catch { /* retry until the Worker is listening */ }
		if (dev.exitCode !== null) throw new Error(`Development process exited before ${base} became ready.`);
		await sleep(250);
	}
	throw new Error(`Timed out waiting for ${base}.`);
}

class CookieJar {
	constructor() { this.values = new Map(); }
	store(response) {
		const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
		for (const header of values) {
			const pair = header.split(';', 1)[0];
			const index = pair.indexOf('=');
			if (index > 0) this.values.set(pair.slice(0, index), pair.slice(index + 1));
		}
	}
	header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; '); }
	get(name) { return this.values.get(name); }
}

async function request(base, path, options = {}, jar) {
	const headers = new Headers(options.headers);
	if (jar?.header()) headers.set('cookie', jar.header());
	const response = await fetch(`${base}${path}`, { ...options, headers, redirect: 'manual' });
	jar?.store(response);
	return response;
}

async function login(base, path, body) {
	const jar = new CookieJar();
	const response = await request(base, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html,application/xhtml+xml', origin: base }, body: new URLSearchParams(body) }, jar);
	assert(response.status === 303, `${base}${path} did not authenticate (HTTP ${response.status}).`);
	assert(jar.get('menyue_session') && jar.get('menyue_csrf'), `${base}${path} did not issue both session and CSRF cookies.`);
	return jar;
}

async function verifyOrigin(base) {
	for (const path of ['/', '/t/table-one-local', '/admin/login', '/counter/login']) {
		const response = await request(base, path);
		assert(response.status === 200, `${base}${path} returned HTTP ${response.status}.`);
	}
	for (const path of ['/menu/menyue-burger.png', '/media/local-asset-seasoned-fries']) {
		const response = await request(base, path);
		assert(response.status === 200 && response.headers.get('content-type')?.startsWith('image/'), `${base}${path} did not serve image media.`);
	}
	const admin = await login(base, '/admin/login', { username: 'admin', password: 'menyue-admin-local' });
	assert((await request(base, '/admin', {}, admin)).status === 200, `${base}/admin rejected its authenticated session.`);
	const counter = await login(base, '/counter/login', { username: 'counter', password: 'menyue-counter-local' });
	assert((await request(base, '/counter', {}, counter)).status === 200, `${base}/counter rejected its authenticated session.`);
	return counter;
}

async function verifyCounterWebSocket(base) {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(`${base}/counter/login`);
		await page.locator('[name="username"]').fill('counter');
		await page.locator('[name="password"]').fill('menyue-counter-local');
		await page.getByRole('button', { name: /open board/i }).click();
		await page.waitForURL(`${base}/counter`);
		const result = await page.evaluate(() => new Promise((resolve) => {
			const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/counter/stream`);
			const timer = setTimeout(() => { socket.close(); resolve('timeout'); }, 8_000);
			socket.onopen = () => { clearTimeout(timer); socket.close(); resolve('open'); };
			socket.onerror = () => { clearTimeout(timer); resolve('error'); };
		}));
		assert(result === 'open', `${base} counter live stream did not connect (${result}).`);
	} finally { await browser.close(); }
}

async function createAndReplay(base) {
	const payload = { idempotencyKey: createdKey, note: 'runtime verifier', lines: [{ itemId: 'local-item-burger', quantity: 1, choiceIds: ['local-choice-fries'] }] };
	const first = await request(base, '/api/tables/table-one-local/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
	assert(first.status === 200, `Order POST returned HTTP ${first.status}.`);
	const created = await first.json();
	createdOrderId = created.order?.id;
	assert(createdOrderId, 'Order POST did not return an order ID.');
	const replay = await request(base, '/api/tables/table-one-local/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
	const replayBody = await replay.json();
	assert(replay.status === 200 && replayBody.idempotent && replayBody.order?.id === createdOrderId, 'Order replay was not idempotent.');
}

async function main() {
	sequenceBefore = Number(d1("SELECT next_number FROM order_sequences WHERE restaurant_id='demo'")[0]?.next_number ?? 1);
	dev = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
	let output = '';
	dev.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
	dev.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
	await waitFor('http://localhost:5173');
	const lanAddress = privateLanAddress();
	const origins = ['http://localhost:5173'];
	if (lanAddress) { const lan = `http://${lanAddress}:5173`; await waitFor(lan); origins.push(lan); }
	for (const origin of origins) await verifyOrigin(origin);
	await createAndReplay('http://localhost:5173');
	const counter = await login('http://localhost:5173', '/counter/login', { username: 'counter', password: 'menyue-counter-local' });
	const orders = await request('http://localhost:5173', '/api/counter/orders', {}, counter);
	assert((await orders.json()).orders.some((order) => order.id === createdOrderId), 'Counter API could not read the created order.');
	const transitioned = await request('http://localhost:5173', `/api/counter/orders/${createdOrderId}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': counter.get('menyue_csrf') }, body: JSON.stringify({ status: 'accepted', version: 1 }) }, counter);
	assert(transitioned.status === 200, `Counter transition returned HTTP ${transitioned.status}.`);
	for (const origin of origins) await verifyCounterWebSocket(origin);
	console.log(`Verified runtime origins: ${origins.join(', ')}.`);
	if (!lanAddress) console.log('LAN verification skipped: no active private IPv4 address was detected.');
}

try { await main(); }
finally {
	await stopDev();
	if (createdOrderId) {
		const directory = mkdtempSync(join(tmpdir(), 'menyue-runtime-cleanup-'));
		const file = join(directory, 'cleanup.sql');
		writeFileSync(file, `DELETE FROM order_line_choices WHERE line_id IN (SELECT id FROM order_lines WHERE order_id='${createdOrderId}');\nDELETE FROM order_events WHERE order_id='${createdOrderId}';\nDELETE FROM order_lines WHERE order_id='${createdOrderId}';\nDELETE FROM order_money_snapshots WHERE order_id='${createdOrderId}';\nDELETE FROM orders WHERE id='${createdOrderId}';\nUPDATE order_sequences SET next_number=${sequenceBefore} WHERE restaurant_id='demo';\n`);
		try { execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'menyue', '--local', '--persist-to', stateDirectory, '--file', file], { cwd: root, stdio: 'inherit', shell: false }); }
		finally { rmSync(directory, { recursive: true, force: true }); }
	}
}
