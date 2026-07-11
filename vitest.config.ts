import { defineConfig } from 'vitest/config';

// Standalone config for unit tests (pure logic — no SvelteKit plugin needed).
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
