export const counterTransitions = {
	new: ['accepted', 'cancelled'],
	accepted: ['preparing', 'cancelled'],
	preparing: ['ready', 'cancelled'],
	ready: ['completed', 'cancelled'],
	completed: [],
	cancelled: [],
} as const;

export type CounterStatus = keyof typeof counterTransitions;

const activeStatuses = ['new', 'accepted', 'preparing', 'ready'] as const;
const closedStatuses = ['completed', 'cancelled'] as const;

// The board keeps operational work indefinitely, but bounds passive history so a
// busy restaurant cannot turn a refresh into an ever-growing projection.
export const COUNTER_CLOSED_HISTORY_DAYS = 7;
export const COUNTER_CLOSED_HISTORY_LIMIT = 100;

export function canCounterTransition(current: string, requested: string): boolean {
	return (counterTransitions[current as CounterStatus] ?? []).includes(requested as never);
}

export function isCounterOrderVisible(
	order: Pick<CounterOrder, 'status' | 'updated_at'>,
	now = new Date(),
): boolean {
	if ((activeStatuses as readonly string[]).includes(order.status)) return true;
	if (!(closedStatuses as readonly string[]).includes(order.status)) return false;
	const updatedAt = new Date(`${order.updated_at.replace(' ', 'T')}Z`);
	return !Number.isNaN(updatedAt.valueOf()) && updatedAt >= new Date(now.valueOf() - COUNTER_CLOSED_HISTORY_DAYS * 86_400_000);
}

export type CounterOrder = {
	id: string;
	display_number: number;
	status: CounterStatus;
	note: string | null;
	total_minor: number;
	currency: string;
	version: number;
	created_at: string;
	updated_at: string;
	label: string;
	currency_minor_unit: number;
	currency_locale: string;
	totals: Array<{ currency: string; total_minor: number; minor_unit: number; locale: string }>;
	lines: Array<{
		id: string;
		item_id: string;
		item_name: string;
		unit_minor: number;
		quantity: number;
		total_minor: number;
		note: string | null;
		choices: Array<{ group_name: string; choice_name: string; price_delta_minor: number }>;
	}>;
};

type CounterLineRow = Omit<CounterOrder['lines'][number], 'choices'> & { order_id: string };
type CounterChoiceRow = CounterOrder['lines'][number]['choices'][number] & { line_id: string; order_id: string };
type CounterTotalRow = CounterOrder['totals'][number] & { order_id: string };

// Kept as a CTE rather than an IN (...) list. This makes the child projections
// fixed-query-count even when every active order is retained.
const selectedOrders = `
WITH eligible_orders AS (
	SELECT o.id,o.status,o.updated_at,o.display_number
	FROM orders o
	WHERE o.restaurant_id=?
		AND (
			o.status IN ('new','accepted','preparing','ready')
			OR (o.status IN ('completed','cancelled') AND o.updated_at >= datetime('now', ?))
		)
), selected_orders AS (
	SELECT id FROM eligible_orders WHERE status IN ('new','accepted','preparing','ready')
	UNION ALL
	SELECT id FROM (
		SELECT id FROM eligible_orders
		WHERE status IN ('completed','cancelled')
		ORDER BY updated_at DESC,display_number DESC
		LIMIT ?
	)
)`;

const selectionArgs = (restaurantId: string): [string, string, number] => [
	restaurantId,
	`-${COUNTER_CLOSED_HISTORY_DAYS} days`,
	COUNTER_CLOSED_HISTORY_LIMIT,
];

export async function counterOrders(db: D1Database, restaurantId = 'demo'): Promise<CounterOrder[]> {
	const [ordersResult, totalsResult, linesResult, choicesResult] = await Promise.all([
		db
			.prepare(
				`${selectedOrders}
				SELECT o.id,o.display_number,o.status,o.note,o.total_minor,o.currency,o.version,o.created_at,o.updated_at,t.label,
					COALESCE(s.minor_unit,2) AS currency_minor_unit,COALESCE(s.locale,'en-US') AS currency_locale
				FROM orders o
				JOIN selected_orders selected ON selected.id=o.id
				JOIN dining_tables t ON t.id=o.table_id AND t.restaurant_id=o.restaurant_id
				LEFT JOIN order_money_snapshots s ON s.order_id=o.id AND s.currency_code=o.currency
				ORDER BY CASE o.status WHEN 'new' THEN 0 WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END,
					o.created_at ASC,o.display_number ASC`,
			)
			.bind(...selectionArgs(restaurantId))
			.all<CounterOrder>(),
		db
			.prepare(
				`${selectedOrders}
				SELECT s.order_id,s.currency_code AS currency,s.total_minor,s.minor_unit,s.locale
				FROM order_money_snapshots s JOIN selected_orders selected ON selected.id=s.order_id
				ORDER BY s.order_id,CASE WHEN s.currency_code=(SELECT currency FROM orders WHERE id=s.order_id) THEN 0 ELSE 1 END,s.currency_code`,
			)
			.bind(...selectionArgs(restaurantId))
			.all<CounterTotalRow>(),
		db
			.prepare(
				`${selectedOrders}
				SELECT l.order_id,l.id,l.item_id,l.item_name,l.unit_minor,l.quantity,l.total_minor,l.note
				FROM order_lines l JOIN selected_orders selected ON selected.id=l.order_id
				ORDER BY l.order_id,l.rowid`,
			)
			.bind(...selectionArgs(restaurantId))
			.all<CounterLineRow>(),
		db
			.prepare(
				`${selectedOrders}
				SELECT l.order_id,c.line_id,c.group_name,c.choice_name,c.price_delta_minor
				FROM order_line_choices c
				JOIN order_lines l ON l.id=c.line_id
				JOIN selected_orders selected ON selected.id=l.order_id
				ORDER BY c.line_id,c.rowid`,
			)
			.bind(...selectionArgs(restaurantId))
			.all<CounterChoiceRow>(),
	]);

	const orders = ordersResult.results;
	const ordersById = new Map(orders.map((order) => [order.id, order]));
	const linesById = new Map<string, CounterOrder['lines'][number]>();
	for (const order of orders) {
		order.totals = [];
		order.lines = [];
	}
	for (const total of totalsResult.results)
		ordersById.get(total.order_id)?.totals.push({
			currency: total.currency,
			total_minor: total.total_minor,
			minor_unit: total.minor_unit,
			locale: total.locale,
		});
	for (const line of linesResult.results) {
		const order = ordersById.get(line.order_id);
		if (!order) continue;
		const projectedLine = {
			id: line.id,
			item_id: line.item_id,
			item_name: line.item_name,
			unit_minor: line.unit_minor,
			quantity: line.quantity,
			total_minor: line.total_minor,
			note: line.note,
			choices: [],
		};
		order.lines.push(projectedLine);
		linesById.set(line.id, projectedLine);
	}
	for (const choice of choicesResult.results)
		linesById.get(choice.line_id)?.choices.push({
			group_name: choice.group_name,
			choice_name: choice.choice_name,
			price_delta_minor: choice.price_delta_minor,
		});
	for (const order of orders) {
		if (!order.totals.length)
			order.totals = [
				{
					currency: order.currency,
					total_minor: order.total_minor,
					minor_unit: order.currency_minor_unit,
					locale: order.currency_locale,
				},
			];
	}
	return orders;
}
