import { expect, test } from 'vitest';
import { publishOrderCreated } from '$lib/server/order-notifications';

test('a rejected realtime publication is background best-effort', async () => {
	let scheduled: Promise<unknown> | undefined;
	let calls = 0;
	const platform = {
		env: {
			ORDER_HUB: {
				getByName: () => ({
					fetch: async () => {
						calls += 1;
						throw new Error('hub unavailable');
					},
				}),
			},
		},
		ctx: { waitUntil: (promise: Promise<unknown>) => { scheduled = promise; } },
	} as unknown as App.Platform;

	expect(() => publishOrderCreated(platform, 'demo', 'order-1')).not.toThrow();
	expect(scheduled).toBeDefined();
	await scheduled;
	expect(calls).toBe(1);
});

test('a missing background context cannot change a committed submission result', () => {
	const platform = {
		env: { ORDER_HUB: { getByName: () => ({ fetch: async () => new Response() }) } },
		ctx: { waitUntil: () => { throw new Error('no background context'); } },
	} as unknown as App.Platform;

	expect(() => publishOrderCreated(platform, 'demo', 'order-1')).not.toThrow();
});
