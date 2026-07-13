import { describe, expect, it } from 'vitest';
import { counterConnectionState, createCounterArrivalTracker } from '$lib/counter-feed';

type Order = { id: string; display_number: number; label: string };
const one: Order = { id: 'one', display_number: 1, label: 'Table 1' };
const two: Order = { id: 'two', display_number: 2, label: 'Table 2' };

describe('counter arrival tracker', () => {
	it('keeps the initial snapshot silent', () => {
		const tracker = createCounterArrivalTracker([one]);
		expect(tracker.reconcile([one])).toEqual([]);
	});

	it('announces an order once even when websocket, poll, and reconnect snapshots overlap', () => {
		const tracker = createCounterArrivalTracker([one]);
		expect(tracker.reconcile([one, two])).toEqual([two]); // websocket-triggered refresh
		expect(tracker.reconcile([one, two])).toEqual([]); // regular poll
		expect(tracker.reconcile([two, one])).toEqual([]); // reconnect snapshot in a different order
	});
});

describe('counter connection state', () => {
	it('reports live, polling fallback, and stale from the most recent valid snapshot', () => {
		const lastSnapshotAt = new Date('2026-07-13T12:00:00Z');
		expect(counterConnectionState({ socketConnected: true, pollingFallbackActive: false, lastSnapshotAt, snapshotValid: true, now: lastSnapshotAt.getTime() + 1_000 })).toBe('live');
		expect(counterConnectionState({ socketConnected: false, pollingFallbackActive: false, lastSnapshotAt, snapshotValid: true, now: lastSnapshotAt.getTime() + 1_000 })).toBe('reconnecting');
		expect(counterConnectionState({ socketConnected: false, pollingFallbackActive: true, lastSnapshotAt, snapshotValid: true, now: lastSnapshotAt.getTime() + 1_000 })).toBe('polling');
		expect(counterConnectionState({ socketConnected: false, pollingFallbackActive: true, lastSnapshotAt, snapshotValid: true, now: lastSnapshotAt.getTime() + 30_000 })).toBe('stale');
	});

	it('does not call a socket invalidation fresh before its replacement snapshot arrives', () => {
		const lastSnapshotAt = new Date('2026-07-13T12:00:00Z');
		expect(counterConnectionState({ socketConnected: true, pollingFallbackActive: false, lastSnapshotAt, snapshotValid: false, now: lastSnapshotAt.getTime() + 1_000 })).toBe('stale');
		// A failed fetch leaves the previous snapshot visible but invalid.
		expect(counterConnectionState({ socketConnected: false, pollingFallbackActive: true, lastSnapshotAt, snapshotValid: false, now: lastSnapshotAt.getTime() + 2_000 })).toBe('stale');
	});
});
