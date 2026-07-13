import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');
const token = 'table-one-local';
const artifactRoot = resolve(root, 'test-results/artifacts');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function urls() {
	const candidates = new Set(['http://localhost:5173']);
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (
				address.family === 'IPv4' &&
				!address.internal &&
				!address.address.startsWith('169.254.')
			)
				candidates.add(`http://${address.address}:5173`);
		}
	}
	return [...candidates];
}

async function reachable(baseUrl) {
	try {
		const response = await fetch(`${baseUrl}/t/${token}`, { signal: AbortSignal.timeout(2_000) });
		return response.status === 200;
	} catch {
		return false;
	}
}

function sanitize(value) {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function createdOrders(notBefore = 0) {
	const result = new Set();
	if (!existsSync(artifactRoot)) return result;
	for (const host of readdirSync(artifactRoot, { withFileTypes: true })) {
		if (!host.isDirectory()) continue;
		for (const project of readdirSync(join(artifactRoot, host.name), { withFileTypes: true })) {
			if (!project.isDirectory()) continue;
			for (const name of readdirSync(join(artifactRoot, host.name, project.name))) {
				if (!name.endsWith('.json') || name === 'latest.json') continue;
				const path = join(artifactRoot, host.name, project.name, name);
				if (statSync(path).mtimeMs < notBefore) continue;
				try {
					const evidence = JSON.parse(readFileSync(path, 'utf8'));
					for (const id of evidence.createdOrderIds ?? []) if (/^[0-9a-f-]{36}$/i.test(id)) result.add(id);
				} catch {
					// Keep evidence collection resilient to a partial artifact.
				}
			}
		}
	}
	return result;
}

function cleanupOrders(ids) {
	if (!ids.size) return;
	const statements = [];
	for (const id of ids) {
		const quoted = `'${id}'`;
		statements.push(`DELETE FROM order_line_choices WHERE line_id IN (SELECT id FROM order_lines WHERE order_id=${quoted});`);
		statements.push(`DELETE FROM order_events WHERE order_id=${quoted};`);
		statements.push(`DELETE FROM order_lines WHERE order_id=${quoted};`);
		statements.push(`DELETE FROM order_money_snapshots WHERE order_id=${quoted};`);
		statements.push(`DELETE FROM orders WHERE id=${quoted};`);
	}
	statements.push("UPDATE order_sequences SET next_number=COALESCE((SELECT MAX(display_number)+1 FROM orders WHERE restaurant_id='demo'), 1) WHERE restaurant_id='demo';");
	const sqlPath = resolve(root, 'test-results/e2e-cleanup.sql');
	writeFileSync(sqlPath, `${statements.join('\n')}\n`, 'utf8');
	try {
		execFileSync(pnpm, ['exec', 'wrangler', 'd1', 'execute', 'menyue', '--local', '--persist-to', '.wrangler/state', '--file', sqlPath], {
			cwd: root,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});
	} finally {
		rmSync(sqlPath, { force: true });
	}
}

if (process.env.E2E_CLEANUP_ONLY) {
	cleanupOrders(createdOrders());
	process.exit(0);
}

const reachableUrls = [];
for (const url of urls()) if (await reachable(url)) reachableUrls.push(url);
if (!reachableUrls.length) throw new Error('No reachable Menyue runtime at port 5173.');
console.log(`Evidence matrix: ${reachableUrls.join(', ')}`);

const runStartedAt = Date.now();
let exitCode = 0;
for (const baseUrl of reachableUrls) {
	console.log(`\n=== Playwright evidence: ${baseUrl} (desktop + mobile) ===`);
	const result = spawnSync(
		pnpm,
		['exec', 'playwright', 'test', '--project=desktop', '--project=mobile', 'tests/e2e/table-baseline.spec.ts'],
		{
			cwd: root,
			stdio: 'inherit',
			shell: process.platform === 'win32',
			env: { ...process.env, BASE_URL: baseUrl, E2E_HOST: sanitize(new URL(baseUrl).hostname) },
		},
	);
	if (result.error) console.error(`Playwright process error for ${baseUrl}: ${result.error.message}`);
	if ((result.status ?? 1) !== 0) exitCode = result.status ?? 1;
}

const ids = createdOrders(runStartedAt);
if (ids.size) {
	console.log(`Cleaning ${ids.size} test-created order(s) from the local D1 state.`);
	cleanupOrders(ids);
}
process.exitCode = exitCode;
