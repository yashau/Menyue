import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDirectory = '.wrangler/setup-local-auth-session-verification';
const absoluteStateDirectory = resolve(root, stateDirectory);
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const setup = resolve(root, 'scripts/setup-local.mjs');
const username = 'admin';
const password = 'menyue-admin-local';
const sessionId = 'local-admin-session-verification';

function readVariable(source, name) {
	const match = source.match(new RegExp(`^${name}\\s*=\\s*(.*)$`, 'm'));
	return match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function runSetup(reset = false) {
	execFileSync(process.execPath, [setup, ...(reset ? ['--reset'] : [])], {
		cwd: root,
		env: { ...process.env, MENYUE_LOCAL_STATE_DIRECTORY: stateDirectory },
		stdio: 'inherit',
		shell: false,
	});
}

function query(command) {
	const output = execFileSync(
		process.execPath,
		[
			wrangler,
			'd1',
			'execute',
			'menyue',
			'--local',
			'--persist-to',
			stateDirectory,
			'--command',
			command,
			'--json',
		],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false },
	);
	const result = JSON.parse(output);
	assert(result[0]?.success, 'Local D1 query failed.');
	return result[0].results;
}

function hasExpectedPassword(record, pepper) {
	const actual = pbkdf2Sync(password + pepper, record.salt, record.iterations, 32, 'sha256');
	const expected = Buffer.from(record.password_hash, 'base64url');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function localAdmin() {
	const record = query(
		"SELECT id, username, password_hash, salt, iterations, enabled, must_change_password, auth_version FROM users WHERE id='local-admin'",
	)[0];
	assert(record, 'The local admin record is missing.');
	return record;
}

try {
	runSetup(true);
	const pepper = readVariable(readFileSync(resolve(root, '.dev.vars'), 'utf8'), 'AUTH_PEPPER');
	assert(pepper, 'AUTH_PEPPER is required for verification.');
	const before = localAdmin();
	assert(
		before.username === username &&
			before.enabled === 1 &&
			before.must_change_password === 0 &&
			hasExpectedPassword(before, pepper),
		'Reset did not create the expected local admin credentials.',
	);
	query(
		`INSERT INTO sessions(id, token_hash, principal_type, principal_id, auth_version, csrf_hash, expires_at, absolute_expires_at)
		 VALUES ('${sessionId}', 'verification-token', 'user', 'local-admin', ${before.auth_version}, 'verification-csrf', datetime('now', '+1 hour'), datetime('now', '+1 hour'))`,
	);

	for (let invocation = 1; invocation <= 3; invocation += 1) {
		runSetup();
		const current = localAdmin();
		assert(
			current.auth_version === before.auth_version,
			`Non-reset setup invocation ${invocation} changed auth_version from ${before.auth_version} to ${current.auth_version}.`,
		);
		assert(
			hasExpectedPassword(current, pepper),
			`Non-reset setup invocation ${invocation} changed the local admin password.`,
		);
		const activeSession = query(
			`SELECT sessions.id FROM sessions JOIN users ON users.id=sessions.principal_id
			 WHERE sessions.id='${sessionId}' AND users.auth_version=sessions.auth_version
			   AND sessions.expires_at > CURRENT_TIMESTAMP AND sessions.absolute_expires_at > CURRENT_TIMESTAMP`,
		)[0];
		assert(
			activeSession?.id === sessionId,
			`Non-reset setup invocation ${invocation} invalidated the active session.`,
		);
	}

	runSetup(true);
	const afterReset = localAdmin();
	assert(
		hasExpectedPassword(afterReset, pepper),
		'Reset did not restore the expected local admin password.',
	);
	assert(
		query(`SELECT id FROM sessions WHERE id='${sessionId}'`)[0] === undefined,
		'Reset retained verification session state.',
	);
	console.log(
		`Verified local admin auth invariant: auth_version ${before.auth_version} remained stable across three non-reset setups; reset restored ${username} / ${password}.`,
	);
} finally {
	if (existsSync(absoluteStateDirectory))
		rmSync(absoluteStateDirectory, { recursive: true, force: true });
}
