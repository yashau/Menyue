import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';
const usesManagedLocalServer = !process.env.BASE_URL;

export default defineConfig({
	testDir: './tests/e2e',
	outputDir: 'test-results/playwright',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: !!process.env.CI,
	reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
	use: {
		baseURL,
		locale: 'en-US',
		trace: 'off',
		screenshot: 'off',
		video: 'off',
	},
	projects: [
		{
			name: 'desktop',
			use: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
		},
		{
			name: 'mobile',
			use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
		},
	],
	webServer: usesManagedLocalServer
		? {
				command: 'node scripts/playwright-dev-server.mjs',
				url: `${baseURL}/api/health`,
				timeout: 195_000,
				reuseExistingServer: true,
				stdout: 'pipe',
				stderr: 'pipe',
			}
		: undefined,
});
