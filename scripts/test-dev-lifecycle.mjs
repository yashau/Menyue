import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const root = resolve('.');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function stop(child) {
	if (child.exitCode !== null) return;
	const exited = new Promise((resolve) => child.once('exit', resolve));
	child.send({ type: 'shutdown' });
	await Promise.race([exited, sleep(15_000)]);
	if (child.exitCode !== null) return;

	if (process.platform === 'win32') {
		await new Promise((resolve) => {
			execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => resolve());
		});
		await exited;
		return;
	}
	child.kill('SIGKILL');
	await exited;
}

async function waitForPortToClose() {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		try {
			await fetch('http://127.0.0.1:5173/', { redirect: 'manual' });
			await sleep(250);
		} catch {
			return;
		}
	}
	throw new Error('The development server continued to answer after its parent process exited.');
}

async function expectForeignOccupantToBePreserved() {
	const foreign = createServer((_, response) => response.end('foreign occupant'));
	await new Promise((resolve) => foreign.listen({ host: '0.0.0.0', port: 5173 }, resolve));
	try {
		const child = spawn(process.execPath, ['scripts/dev.mjs'], {
			cwd: root,
			shell: false,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		const code = await new Promise((resolve) => child.once('exit', resolve));
		if (code === 0 || !output.includes('Refusing to start Menyue: port 5173 is already occupied'))
			throw new Error(`Foreign port occupant was not rejected safely.\n${output}`);
		const response = await fetch('http://127.0.0.1:5173/');
		if ((await response.text()) !== 'foreign occupant')
			throw new Error('The lifecycle check disturbed a foreign process on port 5173.');
		console.log('Foreign port occupant was rejected without being stopped.');
	} finally {
		foreign.closeAllConnections?.();
		await new Promise((resolve) => foreign.close(resolve));
	}
}

async function expectHarnessRejectsForeignHttpServer() {
	const foreign = createServer((_, response) => response.end('not Menyue'));
	await new Promise((resolve) => foreign.listen({ host: '0.0.0.0', port: 5173 }, resolve));
	try {
		const child = spawn(process.execPath, ['scripts/playwright-dev-server.mjs'], {
			cwd: root,
			shell: false,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		const code = await new Promise((resolve) => child.once('exit', resolve));
		if (code === 0 || !output.includes('Refusing to start Menyue: port 5173 is already occupied'))
			throw new Error(`The Playwright harness accepted a foreign HTTP server.\n${output}`);
		const response = await fetch('http://127.0.0.1:5173/api/health');
		if ((await response.text()) !== 'not Menyue')
			throw new Error('The Playwright identity check disturbed a foreign process on port 5173.');
		console.log('Playwright harness rejected a foreign HTTP server without stopping it.');
	} finally {
		foreign.closeAllConnections?.();
		await new Promise((resolve) => foreign.close(resolve));
	}
}

async function runCycle(cycle) {
	await waitForPortToClose();
	const child = spawn(process.execPath, ['scripts/dev.mjs'], {
		cwd: root,
		shell: false,
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	});
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));

	const deadline = Date.now() + 180_000;
	try {
		while (Date.now() < deadline) {
			try {
				const response = await fetch('http://127.0.0.1:5173/', { redirect: 'manual' });
				console.log(`Cycle ${cycle}: HTTP ${response.status} received from 0.0.0.0:5173.`);
				return;
			} catch {
				if (child.exitCode !== null) throw new Error(output);
				await sleep(250);
			}
		}
		throw new Error(`Cycle ${cycle} timed out waiting for the development server.\n${output}`);
	} finally {
		await stop(child);
		await waitForPortToClose();
	}
}

await waitForPortToClose();
await expectForeignOccupantToBePreserved();
await expectHarnessRejectsForeignHttpServer();
await runCycle(1);
await runCycle(2);
console.log(
	'Development lifecycle completed two start/stop cycles without leaving its parent process running.',
);
