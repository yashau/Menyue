import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { acquireExclusiveLock, recoverStaleExclusiveLock, releaseExclusiveLock } from './lock-file.mjs';

const root = resolve('.');
const baseURL = 'http://localhost:5173';
const readinessTimeout = Number(process.env.MENYUE_E2E_STARTUP_TIMEOUT_MS ?? '180000');
const harnessLock = resolve(root, '.wrangler/playwright-dev-server.lock');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let child;
let ownsHarnessLock = false;
let shuttingDown = false;
let recentOutput = '';
let keepAliveTimer;
let harnessOwner;

function remember(chunk) {
	recentOutput = `${recentOutput}${chunk}`.slice(-16_000);
}

function processIsRunning(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code === 'EPERM';
	}
}

async function isReady() {
	try {
		const response = await fetch(`${baseURL}/api/health`, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
		const body = await response.json().catch(() => null);
		return response.status === 200 && body?.service === 'menyue' && body?.runtime === 'web';
	} catch {
		return false;
	}
}

async function readLock() {
	try {
		return JSON.parse(await readFile(harnessLock, 'utf8'));
	} catch {
		return null;
	}
}

async function acquireHarnessLock() {
	await mkdir(dirname(harnessLock), { recursive: true });
	while (true) {
		try {
			harnessOwner = await acquireExclusiveLock(harnessLock, 'playwright-dev-server.mjs');
			ownsHarnessLock = true;
			return 'owner';
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
			const owner = await readLock();
			if (!processIsRunning(owner?.pid)) {
				console.log(`[playwright-server] Removing stale harness lock left by PID ${owner?.pid ?? 'unknown'}.`);
				if (!(await recoverStaleExclusiveLock(harnessLock, processIsRunning)))
					throw new Error('Refusing to remove a stale harness lock without an ownership token. Remove the legacy lock file manually.');
				continue;
			}
			return 'peer';
		}
	}
}

async function releaseHarnessLock() {
	if (!ownsHarnessLock) return;
	ownsHarnessLock = false;
	await releaseExclusiveLock(harnessLock, harnessOwner?.token);
	harnessOwner = undefined;
}

async function waitForReady(label) {
	const deadline = Date.now() + readinessTimeout;
	while (Date.now() < deadline) {
		if (await isReady()) {
			console.log(`[playwright-server] ${label}: ${baseURL} is ready.`);
			return;
		}
		if (child && child.exitCode !== null) {
			throw new Error(
				`Menyue development server exited before becoming ready (code ${child.exitCode ?? 1}).\n` +
				`Recent server output:\n${recentOutput || '(no output)'}`,
			);
		}
		await sleep(250);
	}
	throw new Error(
		`Timed out after ${readinessTimeout}ms waiting for ${baseURL}.\nRecent server output:\n${recentOutput || '(no output)'}`,
	);
}

async function stopOwnedChild() {
	if (!child || child.exitCode !== null) return;
	const exited = new Promise((resolve) => child.once('exit', resolve));
	child.kill('SIGTERM');
	await Promise.race([exited, sleep(10_000)]);
	if (child.exitCode !== null) return;
	if (process.platform === 'win32') {
		await new Promise((resolve) => execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => resolve()));
	} else {
		child.kill('SIGKILL');
	}
	await Promise.race([exited, sleep(5_000)]);
}

async function shutdown(exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	if (keepAliveTimer) clearInterval(keepAliveTimer);
	await stopOwnedChild();
	await releaseHarnessLock();
	process.exitCode = exitCode;
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

async function stayAlive() {
	keepAliveTimer = setInterval(() => {}, 1_000);
	await new Promise(() => {});
}

async function main() {
	if (await isReady()) {
		console.log(`[playwright-server] Reusing the ready server at ${baseURL}; it will not be stopped by this harness.`);
		await stayAlive();
		return;
	}

	const lockStatus = await acquireHarnessLock();
	if (lockStatus === 'peer') {
		console.log('[playwright-server] Another Playwright harness is starting Menyue; waiting for its server.');
		await waitForReady('Peer harness server');
		await stayAlive();
		return;
	}

	if (await isReady()) {
		console.log(`[playwright-server] Reusing the server that became ready at ${baseURL}.`);
		await stayAlive();
		return;
	}

	console.log(`[playwright-server] Starting one Menyue dev server on ${baseURL} (timeout ${readinessTimeout}ms).`);
	child = spawn(process.execPath, ['scripts/dev.mjs'], {
		cwd: root,
		shell: false,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	for (const stream of [child.stdout, child.stderr]) {
		stream.on('data', (chunk) => {
			remember(chunk);
			process.stdout.write(chunk);
		});
	}
	await waitForReady('Menyue server');
	await new Promise((resolve) => child.once('exit', resolve));
	if (!shuttingDown) {
		await releaseHarnessLock();
		throw new Error(`Menyue development server stopped unexpectedly.\nRecent server output:\n${recentOutput}`);
	}
}

main().catch(async (error) => {
	console.error(`[playwright-server] ${error instanceof Error ? error.message : error}`);
	await shutdown(1);
});
