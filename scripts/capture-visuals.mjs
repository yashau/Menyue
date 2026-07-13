import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const output = resolve('test-results/visuals');
const viewports = [320, 375, 390, 412, 768, 1440].map((width) => ({ width, height: width < 500 ? 860 : 960 }));
const pages = [
	['public', '/'],
	['table', '/t/table-one-local'],
	['admin-login', '/admin/login'],
	['counter-login', '/counter/login'],
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
	for (const viewport of viewports) for (const [name, path] of pages) {
		const page = await browser.newPage({ viewport });
		await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
		await page.screenshot({ path: resolve(output, `${name}-${viewport.width}.png`), fullPage: true });
		await page.close();
	}
} finally { await browser.close(); }
console.log(`Captured ${viewports.length * pages.length} responsive screenshots in ${output}`);
