import { defineConfig, devices } from '@playwright/test';

// One D1-backed dev server must own the local SQLite. Reuse an already-running
// server if present (avoids two miniflare instances locking the same file).
const PORT = Number(process.env.PW_PORT ?? 5290);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: 'e2e',
	timeout: 45_000,
	expect: { timeout: 8_000 },
	fullyParallel: false,
	workers: 1,
	retries: 1,
	reporter: [['list']],
	globalSetup: './e2e/global-setup.ts',
	outputDir: 'e2e/.results',
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port ${PORT}`,
		url: BASE_URL,
		reuseExistingServer: true,
		timeout: 180_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
