import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireExclusiveLock, recoverStaleExclusiveLock, releaseExclusiveLock } from '../../scripts/lock-file.mjs';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('exclusive local locks', () => {
	it('has exactly one concurrent owner and cannot delete a live successor', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'menyue-lock-')); directories.push(directory);
		const path = join(directory, 'lock.json');
		const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => acquireExclusiveLock(path, 'test')));
		const owners = attempts.filter((attempt) => attempt.status === 'fulfilled');
		const winner = owners[0];
		if (!winner) throw new Error('No lock owner was elected.');
		expect(owners).toHaveLength(1);
		expect(await releaseExclusiveLock(path, 'not-the-owner')).toBe(false);
		expect(JSON.parse(await readFile(path, 'utf8')).token).toBe(winner.value.token);
		expect(await releaseExclusiveLock(path, winner.value.token)).toBe(true);
	});

	it('recovers a stale tokenized lock but leaves a live owner untouched', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'menyue-lock-')); directories.push(directory);
		const stale = join(directory, 'stale.json');
		await writeFile(stale, JSON.stringify({ token: 'stale', pid: 999_999_999, command: 'test' }));
		expect(await recoverStaleExclusiveLock(stale, () => false)).toBe(true);
		const live = await acquireExclusiveLock(stale, 'test');
		expect(await recoverStaleExclusiveLock(stale, (pid: number) => pid === live.pid)).toBe(false);
		expect(JSON.parse(await readFile(stale, 'utf8')).token).toBe(live.token);
	});
});
