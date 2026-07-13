import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { acquireExclusiveLock, recoverStaleExclusiveLock, releaseExclusiveLock } from './lock-file.mjs';

const root = resolve('.');
const stateDirectory = resolve(root, '.wrangler/state');
const startupLock = resolve(root, '.wrangler/menyue-dev-startup.lock');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');

const children = new Set();
let stopping = false;
let shutdownPromise;
let holdsStartupLock = false;
let startupOwner;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function processIsRunning(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code === 'EPERM';
	}
}

async function readLockOwner() {
	try {
		return JSON.parse(await readFile(startupLock, 'utf8'));
	} catch {
		return null;
	}
}

async function acquireStartupLock() {
	await mkdir(dirname(startupLock), { recursive: true });
	try {
		startupOwner = await acquireExclusiveLock(startupLock, 'scripts/dev.mjs');
		holdsStartupLock = true;
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
		const owner = await readLockOwner();
		if (!processIsRunning(owner?.pid)) {
			if (!(await recoverStaleExclusiveLock(startupLock, processIsRunning)))
				throw new Error('Refusing to remove a stale startup lock without an ownership token. Remove the legacy lock file manually.');
			return acquireStartupLock();
		}
		throw new Error(
			`Another Menyue development startup is already building the Worker (PID ${owner.pid}). ` +
			'Wait for it to become ready or stop that Menyue-owned process before starting another server.',
		);
	}
}

async function releaseStartupLock() {
	if (!holdsStartupLock) return;
	holdsStartupLock = false;
	await releaseExclusiveLock(startupLock, startupOwner?.token);
	startupOwner = undefined;
}

function privateLanAddresses() {
	const addresses = new Set();
	for (const entries of Object.values(networkInterfaces()))
		for (const entry of entries ?? []) {
			if (entry.family !== 'IPv4' || entry.internal) continue;
			const [first, second] = entry.address.split('.').map(Number);
			if (
				first === 10 ||
				(first === 172 && second >= 16 && second <= 31) ||
				(first === 192 && second === 168)
			)
				addresses.add(entry.address);
		}
	return [...addresses];
}

async function assertPortAvailable() {
	for (const host of ['0.0.0.0', '127.0.0.1']) {
		const probe = createServer();
		try {
			await new Promise((resolve, reject) => {
				probe.once('error', reject);
				probe.listen({ host, port: 5173 }, resolve);
			});
		} catch (error) {
			const detail = error instanceof Error ? `${error.code ?? error.name}: ${error.message}` : String(error);
			throw new Error(
				`Refusing to start Menyue: port 5173 is already occupied (${detail}). ` +
					'No process was stopped; close the owning process or choose a different port explicitly.',
			);
		} finally {
			if (probe.listening) await new Promise((resolve) => probe.close(resolve));
		}
	}
}

function isRunning(child) {
	return child.exitCode === null && child.signalCode === null;
}

function start(script, args) {
	const child = spawn(process.execPath, [script, ...args], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
	});
	children.add(child);
	child.once('error', (error) => {
		if (!stopping) {
			console.error(`Unable to start development runtime: ${error.message}`);
			void shutdown(1);
		}
	});
	child.once('exit', (code) => {
		children.delete(child);
		if (!stopping) {
			console.error(`A development process stopped unexpectedly with code ${code ?? 1}.`);
			void shutdown(code ?? 1);
		}
	});
	return child;
}

async function stopChild(child) {
	if (!isRunning(child)) return;

	// Let Wrangler clean up first. On Windows, fall back to taskkill only for
	// this script's own process tree so an interrupted dev run cannot leak workerd.
	const exited = new Promise((resolve) => child.once('exit', resolve));
	child.kill('SIGINT');
	await Promise.race([exited, sleep(10_000)]);

	if (!isRunning(child)) return;
	if (process.platform === 'win32') {
		await new Promise((resolve) => {
			execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => resolve());
		});
	} else {
		child.kill('SIGKILL');
	}
	await Promise.race([exited, sleep(5_000)]);
}

async function shutdown(code = 0) {
	if (shutdownPromise) return shutdownPromise;
	stopping = true;
	shutdownPromise = Promise.allSettled([...children].map(stopChild)).then(() => {
		process.exitCode = code;
		return releaseStartupLock();
	});
	return shutdownPromise;
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
process.on('message', (message) => {
	if (message?.type === 'shutdown') void shutdown();
});

async function waitForReady() {
	const deadline = Date.now() + 120_000;
	while (!stopping && Date.now() < deadline) {
		try {
			const response = await fetch('http://127.0.0.1:5173/api/health', { redirect: 'manual' });
			const body = await response.json().catch(() => null);
			if (response.status !== 200 || body?.service !== 'menyue' || body?.runtime !== 'web') throw new Error(`Unexpected Menyue readiness response: HTTP ${response.status}.`);
			const lan = privateLanAddresses().map((address) => `http://${address}:5173`);
			console.log(`Menyue development server is ready at http://localhost:5173 (HTTP ${response.status}).`);
			console.log(`LAN URL${lan.length === 1 ? '' : 's'}: ${lan.length ? lan.join(', ') : 'none (no active private IPv4 address detected)'}.`);
			return;
		} catch {
			await sleep(250);
		}
	}
	throw new Error(
		stopping
			? 'Development startup was interrupted.'
			: 'Timed out waiting for http://0.0.0.0:5173.',
	);
}

async function main() {
	await acquireStartupLock();
	execFileSync(process.execPath, [resolve(root, 'scripts/setup-local.mjs')], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
	});
	await assertPortAvailable();
	execFileSync(process.execPath, [vite, 'build'], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
		env: { ...process.env, MENYUE_WRANGLER_CONFIG: 'wrangler.dev.jsonc' },
	});
	start(wrangler, [
		'dev',
		'--config',
		'realtime/wrangler.jsonc',
		'--ip',
		'127.0.0.1',
		'--port',
		'8788',
		'--local',
		'--persist-to',
		stateDirectory,
	]);
	start(wrangler, [
		'dev',
		'.svelte-kit/cloudflare-dev/_worker.js',
		'--config',
		'wrangler.dev.jsonc',
		'--ip',
		'0.0.0.0',
		'--port',
		'5173',
		'--local',
		'--persist-to',
		stateDirectory,
	]);
	await waitForReady();
}

main().catch(async (error) => {
	console.error(error instanceof Error ? error.message : error);
	await shutdown(1);
});
