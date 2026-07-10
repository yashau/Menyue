import { randomUUID, randomBytes, pbkdf2Sync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [username, password, counterPassword] = process.argv.slice(2);
const pepper = process.env.AUTH_PEPPER;
if (!username || !password || !counterPassword || !pepper) {
	console.error(
		'Set AUTH_PEPPER then run: pnpm bootstrap:local -- <username> <staff-password> <counter-password>',
	);
	process.exit(1);
}
if (password.length < 12 || counterPassword.length < 12)
	throw new Error('Passwords must be at least 12 characters.');
const credential = (value) => {
	const salt = randomBytes(24).toString('base64url');
	return {
		salt,
		hash: pbkdf2Sync(value + pepper, salt, 210000, 32, 'sha256').toString('base64url'),
	};
};
const admin = credential(password),
	counter = credential(counterPassword),
	id = randomUUID();
const sql = `INSERT INTO users(id,username,display_name,role,password_hash,salt,iterations,must_change_password) SELECT '${id}','${username.replaceAll("'", "''")}','Local administrator','admin','${admin.hash}','${admin.salt}',210000,1 WHERE NOT EXISTS(SELECT 1 FROM users WHERE enabled=1 AND role='admin'); INSERT OR IGNORE INTO counter_credentials(id,password_hash,salt,iterations) VALUES(1,'${counter.hash}','${counter.salt}',210000);`;
const work = mkdtempSync(join(tmpdir(), 'menyue-bootstrap-'));
const sqlFile = join(work, 'bootstrap.sql');
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
writeFileSync(sqlFile, sql, { encoding: 'utf8', mode: 0o600 });
try {
	const args = [wrangler, 'd1', 'execute', 'menyue', '--local', '--file', sqlFile];
	if (process.env.MENYUE_PERSIST_TO) args.push('--persist-to', process.env.MENYUE_PERSIST_TO);
	execFileSync(process.execPath, args, { stdio: 'inherit', shell: false });
} finally {
	rmSync(work, { recursive: true, force: true });
}
console.log(
	'Local administrator initialized. Sign in at /admin/login and change the temporary password.',
);
