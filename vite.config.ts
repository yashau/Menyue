import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5290,
		strictPort: false,
		watch: {
			// don't reload on DB/test artifact churn
			ignored: ['**/.wrangler/**', '**/e2e/**', '**/.tmp/**', '**/test-results/**']
		}
	},
	preview: {
		host: '0.0.0.0',
		port: 5291,
		strictPort: false
	}
});
