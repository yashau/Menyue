import { open, readFile, rm } from 'node:fs/promises';

/** Write lock metadata through the exclusive descriptor: there is never an empty lock file. */
export async function acquireExclusiveLock(path, command) {
	const token = crypto.randomUUID();
	const metadata = { token, pid: process.pid, startedAt: new Date().toISOString(), command };
	const handle = await open(path, 'wx');
	try {
		await handle.writeFile(JSON.stringify(metadata), 'utf8');
	} finally {
		await handle.close();
	}
	return metadata;
}

/** Do not delete a successor's lock if shutdown races a stale-lock recovery. */
export async function releaseExclusiveLock(path, token) {
	if (!token) return false;
	try {
		const owner = JSON.parse(await readFile(path, 'utf8'));
		if (owner?.token !== token) return false;
		await rm(path);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

/** A dead owner may be recovered, but only the metadata token we inspected is eligible for deletion. */
export async function recoverStaleExclusiveLock(path, isRunning) {
	try {
		const owner = JSON.parse(await readFile(path, 'utf8'));
		if (!owner?.token || !Number.isInteger(owner.pid) || isRunning(owner.pid)) return false;
		return releaseExclusiveLock(path, owner.token);
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}
