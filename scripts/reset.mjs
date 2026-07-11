// Fresh, isolated DB reset: wipe local D1 state, apply all migrations from
// scratch (migration smoke test), then seed. Run with: pnpm db:reset
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });

console.log('Wiping local D1 state…');
rmSync(join(root, '.wrangler', 'state', 'v3', 'd1'), { recursive: true, force: true });

console.log('Applying migrations on a fresh database…');
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'menyue', '--local']);

console.log('Seeding…');
run('node', ['scripts/seed.mjs']);

console.log('\nFresh database ready.');
