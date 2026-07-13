import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDirectory = '.wrangler/local-r2-fixture-verification';
const failedBootstrapStateDirectory = '.wrangler/local-r2-fixture-failed-bootstrap-verification';
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const setup = resolve(root, 'scripts/setup-local.mjs');
const asset = {
	id: 'local-asset-seasoned-fries',
	key: 'fixture/seasoned-fries.png',
	file: resolve(root, 'static/menu/mas-huni.png'),
};
const expectedHash = createHash('sha256').update(readFileSync(asset.file)).digest('hex');

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function setupEnvironment(state, fault) {
	const environment = { ...process.env };
	delete environment.MENYUE_LOCAL_R2_FAULT;
	return {
		...environment,
		MENYUE_LOCAL_STATE_DIRECTORY: state,
		...(fault ? { MENYUE_LOCAL_R2_FAULT: fault } : {}),
	};
}

function runSetup(state, { reset = false, fault } = {}) {
	return execFileSync(process.execPath, [setup, ...(reset ? ['--reset'] : [])], {
		cwd: root,
		env: setupEnvironment(state, fault),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: false,
	});
}

function expectSetupFailure(state, fault, { reset = false } = {}) {
	try {
		runSetup(state, { reset, fault });
	} catch (error) {
		const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message ?? ''}`;
		assert(
			output.includes(`Fixture R2 upload for ${asset.key} failed after 3 attempts`),
			`Expected an exhausted ${fault} failure, received: ${output}`,
		);
		return;
	}
	throw new Error(`Expected setup to fail with injected ${fault} fault.`);
}

function query(state, command) {
	const output = execFileSync(
		process.execPath,
		[
			wrangler,
			'd1',
			'execute',
			'menyue',
			'--local',
			'--persist-to',
			state,
			'--command',
			command,
			'--json',
		],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false },
	);
	const result = JSON.parse(output);
	assert(result[0]?.success, 'Local D1 query failed.');
	return result[0].results;
}

function downloadedObjectHash(state) {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), 'menyue-local-r2-proof-'));
	const destination = join(temporaryDirectory, 'object');
	try {
		execFileSync(
			process.execPath,
			[
				wrangler,
				'r2',
				'object',
				'get',
				`menyue-media/${asset.key}`,
				'--local',
				'--persist-to',
				state,
				'--file',
				destination,
			],
			{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: false },
		);
		assert(existsSync(destination), 'R2 get did not write the fixture object.');
		return createHash('sha256').update(readFileSync(destination)).digest('hex');
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}

function fixtureMediaSnapshot(state) {
	return query(
		state,
		`SELECT i.photo_asset_id,m.id,m.r2_key,m.content_type,m.bytes,m.sha256,m.state
FROM menu_items i JOIN media_assets m ON m.id=i.photo_asset_id
WHERE i.id='local-item-fries'`,
	);
}

function assertConsistentFixtureMedia(state) {
	const rows = fixtureMediaSnapshot(state);
	assert(rows.length === 1, 'Expected exactly one fixture media mapping.');
	const row = rows[0];
	assert(
		row.photo_asset_id === asset.id &&
			row.id === asset.id &&
			row.r2_key === asset.key &&
			row.sha256 === expectedHash &&
			row.state === 'active',
		`Unexpected fixture media metadata: ${JSON.stringify(row)}`,
	);
	assert(
		downloadedObjectHash(state) === expectedHash,
		'Fixture media metadata points at a missing or incorrect R2 object.',
	);
	return rows;
}

function assertNoFixtureMetadataOrObject(state) {
	const count = Number(
		query(state, `SELECT count(*) AS count FROM media_assets WHERE id='${asset.id}'`)[0]?.count ??
			0,
	);
	assert(count === 0, 'An exhausted first upload created fixture media metadata.');
	try {
		downloadedObjectHash(state);
	} catch {
		return;
	}
	throw new Error('An exhausted first upload left a fixture R2 object behind.');
}

try {
	// A first upload and first retrieval failure must both retry to a verified fixture.
	runSetup(stateDirectory, { reset: true, fault: 'upload-once' });
	assertConsistentFixtureMedia(stateDirectory);
	runSetup(stateDirectory, { fault: 'verify-once' });
	assertConsistentFixtureMedia(stateDirectory);

	// Exhaustion must leave a known-good existing fixture unchanged.
	const baseline = fixtureMediaSnapshot(stateDirectory);
	expectSetupFailure(stateDirectory, 'upload-always');
	assert(
		JSON.stringify(fixtureMediaSnapshot(stateDirectory)) === JSON.stringify(baseline),
		'Upload exhaustion changed existing D1 media metadata.',
	);
	assertConsistentFixtureMedia(stateDirectory);
	expectSetupFailure(stateDirectory, 'verify-always');
	assert(
		JSON.stringify(fixtureMediaSnapshot(stateDirectory)) === JSON.stringify(baseline),
		'Verification exhaustion changed existing D1 media metadata.',
	);
	assertConsistentFixtureMedia(stateDirectory);

	// A failed first setup has no metadata to point at a missing object.
	expectSetupFailure(failedBootstrapStateDirectory, 'upload-always', { reset: true });
	assertNoFixtureMetadataOrObject(failedBootstrapStateDirectory);

	// A final normal setup proves the fixture remains restorable after injected failures.
	runSetup(stateDirectory);
	assertConsistentFixtureMedia(stateDirectory);
	console.log(
		'Verified local R2 fixture retries, retrieval checks, exhaustion consistency, and restoration.',
	);
} finally {
	for (const state of [stateDirectory, failedBootstrapStateDirectory]) {
		const absoluteStateDirectory = resolve(root, state);
		if (existsSync(absoluteStateDirectory))
			rmSync(absoluteStateDirectory, { recursive: true, force: true });
	}
}
