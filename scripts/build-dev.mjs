import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertPortAvailable } from './dev-runtime-integrity.mjs';

const root = resolve('.');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');

try {
	await assertPortAvailable();
} catch (error) {
	throw new Error(
		`Refusing to overwrite the local Worker build while port 5173 is occupied. ` +
		`Stop the running runtime before executing dev:build. ${error instanceof Error ? error.message : error}`,
	);
}

execFileSync(process.execPath, [vite, 'build'], {
	cwd: root,
	stdio: 'inherit',
	shell: false,
	env: { ...process.env, MENYUE_WRANGLER_CONFIG: 'wrangler.dev.jsonc' },
});
