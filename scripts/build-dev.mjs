import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve('.');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');

execFileSync(process.execPath, [vite, 'build'], {
	cwd: root,
	stdio: 'inherit',
	shell: false,
	env: { ...process.env, MENYUE_WRANGLER_CONFIG: 'wrangler.dev.jsonc' },
});
