export type CounterFeedOrder = {
	id: string;
};

export type CounterConnectionState = 'live' | 'reconnecting' | 'polling' | 'stale';

export const COUNTER_STALE_AFTER_MS = 30_000;

/**
 * Tracks every order ID seen for the lifetime of a counter board. A websocket
 * invalidation and the polling response that follows it therefore cannot
 * announce the same order twice.
 */
export function createCounterArrivalTracker<T extends CounterFeedOrder>(initialOrders: readonly T[]) {
	const seenOrderIds = new Set(initialOrders.map((order) => order.id));

	return {
		reconcile(snapshot: readonly T[]): T[] {
			const arrivals = snapshot.filter((order) => !seenOrderIds.has(order.id));
			for (const order of snapshot) seenOrderIds.add(order.id);
			return arrivals;
		},
	};
}

export function counterConnectionState({
	socketConnected,
	pollingFallbackActive,
	lastSnapshotAt,
	snapshotValid,
	now = Date.now(),
	staleAfterMs = COUNTER_STALE_AFTER_MS,
	}: {
	socketConnected: boolean;
	pollingFallbackActive: boolean;
	/** Last successful order snapshot, not a transport heartbeat. */
	lastSnapshotAt: Date | null;
	/** An invalidation remains stale until the next snapshot fetch succeeds. */
	snapshotValid: boolean;
	now?: number;
	staleAfterMs?: number;
}): CounterConnectionState {
	if (!snapshotValid || !lastSnapshotAt || now - lastSnapshotAt.getTime() >= staleAfterMs) return 'stale';
	if (socketConnected) return 'live';
	return pollingFallbackActive ? 'polling' : 'reconnecting';
}
