import { createServer } from 'node:net';

const customerPage = '/t/table-one-local';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(value, message) {
	if (!value) throw new Error(message);
}

function isJavaScript(response) {
	return /(?:java|ecma)script|module/i.test(response.headers.get('content-type') ?? '');
}

function importedModuleUrls(source, parent) {
	const urls = new Set();
	const add = (value) => {
		try {
			const url = new URL(value, parent);
			if (url.pathname.includes('/_app/immutable/') && url.pathname.endsWith('.js')) urls.add(url.href);
		} catch { /* Ignore non-URL import specifiers such as package names. */ }
	};

	// SvelteKit's hydration bootstrap uses dynamic imports and the generated modules
	// use static imports. This deliberately accepts both forms without trying to
	// parse arbitrary JavaScript.
	for (const match of source.matchAll(/\bimport\s*(?:\(\s*)?["'`]([^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g)) add(match[1]);
	for (const match of source.matchAll(/\bfrom\s*["'`]([^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g)) add(match[1]);
	return urls;
}

export async function checkMenyueHealth(baseURL) {
	try {
		const response = await fetch(new URL('/api/health', baseURL), {
			redirect: 'manual',
			signal: AbortSignal.timeout(2_000),
		});
		const body = await response.json().catch(() => null);
		return response.status === 200 && body?.service === 'menyue' && body?.runtime === 'web';
	} catch {
		return false;
	}
}

export async function verifyCustomerRuntime(baseURL, pagePath = customerPage) {
	const pageURL = new URL(pagePath, baseURL);
	const page = await fetch(pageURL, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
	assert(page.status === 200, `${pageURL} returned HTTP ${page.status}.`);
	const html = await page.text();
	const queue = [...importedModuleUrls(html, pageURL)];
	assert(queue.length > 0, `${pageURL} did not reference any SvelteKit entry modules.`);

	const visited = new Set();
	while (queue.length) {
		const moduleURL = queue.shift();
		if (visited.has(moduleURL)) continue;
		visited.add(moduleURL);
		const response = await fetch(moduleURL, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
		assert(response.status === 200, `${moduleURL} returned HTTP ${response.status}.`);
		assert(isJavaScript(response), `${moduleURL} was not served as JavaScript (${response.headers.get('content-type') ?? 'no content type'}).`);
		for (const dependency of importedModuleUrls(await response.text(), moduleURL))
			if (!visited.has(dependency)) queue.push(dependency);
	}

	return { modules: visited.size, pageURL: pageURL.href };
}

export async function inspectCustomerRuntime(baseURL) {
	if (!(await checkMenyueHealth(baseURL))) return { menyue: false };
	try {
		return { menyue: true, ...(await verifyCustomerRuntime(baseURL)) };
	} catch (error) {
		return { menyue: true, error: error instanceof Error ? error.message : String(error) };
	}
}

export async function assertPortAvailable(port = 5173) {
	for (const host of ['0.0.0.0', '127.0.0.1']) {
		const probe = createServer();
		try {
			await new Promise((resolve, reject) => {
				probe.once('error', reject);
				probe.listen({ host, port }, resolve);
			});
		} catch (error) {
			const detail = error instanceof Error ? `${error.code ?? error.name}: ${error.message}` : String(error);
			throw new Error(`Port ${port} is already occupied (${detail}).`);
		} finally {
			if (probe.listening) await new Promise((resolve) => probe.close(resolve));
		}
	}
}

export async function waitForCustomerRuntime(baseURL, timeout = 120_000) {
	const deadline = Date.now() + timeout;
	let lastError = 'server did not answer';
	while (Date.now() < deadline) {
		try {
			if (await checkMenyueHealth(baseURL)) return await verifyCustomerRuntime(baseURL);
			lastError = 'health endpoint did not identify the Menyue web runtime';
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await sleep(250);
	}
	throw new Error(`Timed out waiting for a hydrated Menyue customer runtime at ${baseURL}: ${lastError}`);
}
