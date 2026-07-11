import type { D1Database } from '@cloudflare/workers-types';
import type { OrderStatus } from '$lib/types';

export interface BoardOrderItem {
	name: string;
	quantity: number;
	options: { groupName: string; choiceName: string }[];
	notes: string | null;
	isSuggested: boolean;
	lineTotalBase: number;
}
export interface BoardOrder {
	id: number;
	number: string;
	tableLabel: string;
	status: OrderStatus;
	totalBase: number;
	notes: string | null;
	createdAt: number;
	acceptedAt: number | null;
	completedAt: number | null;
	currencySnapshot: { base: { code: string; symbol: string; precision: number; symbolPosition: 'before' | 'after' } };
	items: BoardOrderItem[];
}

const ACTIVE_STATUSES = ['new', 'accepted', 'preparing'];

export async function loadBoardOrders(
	db: D1Database,
	restaurantId: number,
	opts: { includeClosed?: boolean; limit?: number } = {}
): Promise<BoardOrder[]> {
	const limit = opts.limit ?? 300;
	// The board shows a rolling 24h window (shifts can run past midnight). A small
	// buffer beyond 24h is fetched so the client can trim to exactly 24h.
	const recencyCutoff = Math.floor(Date.now() / 1000) - 26 * 60 * 60;
	const statusFilter = opts.includeClosed
		? ''
		: `AND o.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`;
	const binds: (number | string)[] = [restaurantId, recencyCutoff];
	if (!opts.includeClosed) binds.push(...ACTIVE_STATUSES);
	binds.push(limit);

	const orders = await db
		.prepare(
			`SELECT o.id, o.order_number, o.status, o.total_base, o.notes, o.created_at, o.accepted_at, o.completed_at, o.currency_snapshot, t.label AS table_label
			 FROM orders o JOIN tables t ON t.id = o.table_id
			 WHERE o.restaurant_id = ? AND o.created_at >= ? ${statusFilter}
			 ORDER BY o.created_at DESC LIMIT ?`
		)
		.bind(...binds)
		.all<{
			id: number;
			order_number: string;
			status: OrderStatus;
			total_base: number;
			notes: string | null;
			created_at: number;
			accepted_at: number | null;
			completed_at: number | null;
			currency_snapshot: string;
			table_label: string;
		}>();

	if (orders.results.length === 0) return [];
	const ids = orders.results.map((o) => o.id);
	const items = await db
		.prepare(
			`SELECT order_id, name_snapshot, quantity, options_snapshot, notes, is_suggested, line_total_base
			 FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`
		)
		.bind(...ids)
		.all<{
			order_id: number;
			name_snapshot: string;
			quantity: number;
			options_snapshot: string;
			notes: string | null;
			is_suggested: number;
			line_total_base: number;
		}>();

	const itemsByOrder = new Map<number, BoardOrderItem[]>();
	for (const it of items.results) {
		let opts2: { groupName: string; choiceName: string }[] = [];
		try {
			opts2 = JSON.parse(it.options_snapshot);
		} catch {
			opts2 = [];
		}
		const list = itemsByOrder.get(it.order_id) ?? [];
		list.push({
			name: it.name_snapshot,
			quantity: it.quantity,
			options: opts2,
			notes: it.notes,
			isSuggested: !!it.is_suggested,
			lineTotalBase: it.line_total_base
		});
		itemsByOrder.set(it.order_id, list);
	}

	return orders.results.map((o) => {
		let snapshot = { base: { code: 'MVR', symbol: 'Rf', precision: 2, symbolPosition: 'after' as const } };
		try {
			const parsed = JSON.parse(o.currency_snapshot);
			if (parsed?.base) snapshot = parsed;
		} catch {
			/* keep default */
		}
		return {
			id: o.id,
			number: o.order_number,
			tableLabel: o.table_label,
			status: o.status,
			totalBase: o.total_base,
			notes: o.notes,
			createdAt: o.created_at,
			acceptedAt: o.accepted_at,
			completedAt: o.completed_at,
			currencySnapshot: snapshot,
			items: itemsByOrder.get(o.id) ?? []
		};
	});
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	new: ['accepted', 'cancelled'],
	accepted: ['preparing', 'cancelled'],
	preparing: ['completed', 'cancelled'],
	completed: [],
	cancelled: []
};

export async function updateOrderStatus(
	db: D1Database,
	restaurantId: number,
	orderId: number,
	next: OrderStatus,
	actor: string
): Promise<{ ok: boolean; reason?: string }> {
	const row = await db
		.prepare('SELECT status FROM orders WHERE id = ? AND restaurant_id = ?')
		.bind(orderId, restaurantId)
		.first<{ status: OrderStatus }>();
	if (!row) return { ok: false, reason: 'Order not found' };
	if (!TRANSITIONS[row.status]?.includes(next)) {
		return { ok: false, reason: `Cannot move from ${row.status} to ${next}` };
	}
	const now = Math.floor(Date.now() / 1000);
	const acceptedSet = next === 'accepted' ? ', accepted_at = ' + now : '';
	const completedSet = next === 'completed' ? ', completed_at = ' + now : '';
	await db
		.prepare(`UPDATE orders SET status = ?, updated_at = ${now}${acceptedSet}${completedSet} WHERE id = ? AND restaurant_id = ?`)
		.bind(next, orderId, restaurantId)
		.run();
	await db
		.prepare(
			`INSERT INTO audit_log (restaurant_id, actor, action, entity_type, entity_id, detail, created_at)
			 VALUES (?, ?, 'order.status', 'order', ?, ?, ${now})`
		)
		.bind(restaurantId, actor, orderId, JSON.stringify({ from: row.status, to: next }))
		.run();
	return { ok: true };
}
