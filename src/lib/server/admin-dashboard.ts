/**
 * Dashboard data is deliberately projected in one statement. Besides keeping the
 * overview quick, this means every count follows the same restaurant boundary.
 * `date('now')` is UTC; restaurants do not currently have a timezone setting.
 */
export const adminDashboardMetricsQuery = `
WITH restaurant AS (
	SELECT id,currency,currency_minor_unit,currency_locale
	FROM restaurants
	WHERE id=?
),
categories AS (
	SELECT c.id
	FROM menu_categories c JOIN restaurant r ON r.id=c.restaurant_id
	WHERE c.archived=0
),
items AS (
	SELECT i.id
	FROM menu_items i JOIN categories c ON c.id=i.category_id
	WHERE i.archived=0
),
options AS (
	SELECT choice.id
	FROM combo_choices choice
	JOIN combo_groups combo_group ON combo_group.id=choice.group_id
	JOIN items i ON i.id=combo_group.item_id
	WHERE choice.enabled=1 AND combo_group.enabled=1
),
today_orders AS (
	SELECT o.status,COALESCE(snapshot.total_minor,o.total_minor) AS total_minor
	FROM orders o
	JOIN restaurant r ON r.id=o.restaurant_id
	LEFT JOIN order_money_snapshots snapshot
		ON snapshot.order_id=o.id AND snapshot.currency_code=r.currency
	WHERE o.created_at>=date('now') AND o.created_at<date('now','+1 day')
),
active_orders AS (
	SELECT o.status,COUNT(*) AS count
	FROM orders o JOIN restaurant r ON r.id=o.restaurant_id
	WHERE o.status IN ('new','accepted','preparing','ready')
	GROUP BY o.status
)
SELECT
	COALESCE((SELECT currency FROM restaurant),'USD') AS currency,
	COALESCE((SELECT currency_minor_unit FROM restaurant),2) AS currencyMinorUnit,
	COALESCE((SELECT currency_locale FROM restaurant),'en') AS currencyLocale,
	(SELECT COUNT(*) FROM categories) AS categoryCount,
	(SELECT COUNT(*) FROM items) AS itemCount,
	(SELECT COUNT(*) FROM menu_items i JOIN categories c ON c.id=i.category_id WHERE i.availability='sold_out') AS unavailableItemCount,
	(SELECT COUNT(*) FROM options) AS optionCount,
	(SELECT COUNT(*) FROM item_suggestions s JOIN restaurant r ON r.id=s.restaurant_id WHERE s.enabled=1) AS suggestionCount,
	(SELECT COUNT(*) FROM beverage_prompt_settings b JOIN restaurant r ON r.id=b.restaurant_id WHERE b.enabled=1) AS beveragePromptCount,
	(SELECT COUNT(*) FROM beverage_prompt_items target JOIN restaurant r ON r.id=target.restaurant_id) +
	(SELECT COUNT(*) FROM beverage_prompt_categories target JOIN restaurant r ON r.id=target.restaurant_id) AS beverageTargetCount,
	(SELECT COUNT(*) FROM dining_tables t JOIN restaurant r ON r.id=t.restaurant_id) AS tableCount,
	(SELECT COUNT(*) FROM dining_tables t JOIN restaurant r ON r.id=t.restaurant_id WHERE t.enabled=1) AS enabledTableCount,
	(SELECT COUNT(*) FROM today_orders) AS ordersToday,
	(SELECT COUNT(*) FROM today_orders WHERE status='completed') AS completedToday,
	(SELECT COUNT(*) FROM today_orders WHERE status='cancelled') AS cancelledToday,
	CAST(COALESCE((SELECT SUM(total_minor) FROM today_orders WHERE status!='cancelled'),0) AS TEXT) AS salesTodayMinor,
	CAST(COALESCE((SELECT SUM(total_minor) FROM today_orders WHERE status='completed'),0) AS TEXT) AS revenueTodayMinor,
	COALESCE((SELECT count FROM active_orders WHERE status='new'),0) AS newOrders,
	COALESCE((SELECT count FROM active_orders WHERE status='accepted'),0) AS acceptedOrders,
	COALESCE((SELECT count FROM active_orders WHERE status='preparing'),0) AS preparingOrders,
	COALESCE((SELECT count FROM active_orders WHERE status='ready'),0) AS readyOrders
`;

const menuDashboardMetricsQuery = `
WITH restaurant AS (
	SELECT id,currency,currency_minor_unit,currency_locale FROM restaurants WHERE id=?
),
categories AS (
	SELECT c.id FROM menu_categories c JOIN restaurant r ON r.id=c.restaurant_id WHERE c.archived=0
),
items AS (
	SELECT i.id FROM menu_items i JOIN categories c ON c.id=i.category_id WHERE i.archived=0
),
options AS (
	SELECT choice.id FROM combo_choices choice JOIN combo_groups combo_group ON combo_group.id=choice.group_id
	JOIN items i ON i.id=combo_group.item_id WHERE choice.enabled=1 AND combo_group.enabled=1
)
SELECT
	COALESCE((SELECT currency FROM restaurant),'USD') AS currency,
	COALESCE((SELECT currency_minor_unit FROM restaurant),2) AS currencyMinorUnit,
	COALESCE((SELECT currency_locale FROM restaurant),'en') AS currencyLocale,
	(SELECT COUNT(*) FROM categories) AS categoryCount,
	(SELECT COUNT(*) FROM items) AS itemCount,
	(SELECT COUNT(*) FROM menu_items i JOIN categories c ON c.id=i.category_id WHERE i.availability='sold_out') AS unavailableItemCount,
	(SELECT COUNT(*) FROM options) AS optionCount,
	(SELECT COUNT(*) FROM item_suggestions s JOIN restaurant r ON r.id=s.restaurant_id WHERE s.enabled=1) AS suggestionCount,
	(SELECT COUNT(*) FROM beverage_prompt_settings b JOIN restaurant r ON r.id=b.restaurant_id WHERE b.enabled=1) AS beveragePromptCount,
	(SELECT COUNT(*) FROM beverage_prompt_items target JOIN restaurant r ON r.id=target.restaurant_id) +
	(SELECT COUNT(*) FROM beverage_prompt_categories target JOIN restaurant r ON r.id=target.restaurant_id) AS beverageTargetCount
`;

export type AdminDashboardMetrics = {
	currency: string;
	currencyMinorUnit: number;
	currencyLocale: string;
	categoryCount: number;
	itemCount: number;
	unavailableItemCount: number;
	optionCount: number;
	suggestionCount: number;
	beveragePromptCount: number;
	beverageTargetCount: number;
	tableCount: number;
	enabledTableCount: number;
	ordersToday: number;
	completedToday: number;
	cancelledToday: number;
	salesTodayMinor: string;
	revenueTodayMinor: string;
	newOrders: number;
	acceptedOrders: number;
	preparingOrders: number;
	readyOrders: number;
};

export type MenuDashboardMetrics = Pick<
	AdminDashboardMetrics,
	| 'currency'
	| 'currencyMinorUnit'
	| 'currencyLocale'
	| 'categoryCount'
	| 'itemCount'
	| 'unavailableItemCount'
	| 'optionCount'
	| 'suggestionCount'
	| 'beveragePromptCount'
	| 'beverageTargetCount'
>;

type DashboardRow = Record<keyof AdminDashboardMetrics, unknown>;

const count = (value: unknown) => {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const minor = (value: unknown) => {
	try {
		const parsed = BigInt(String(value ?? '0'));
		return parsed >= 0n ? parsed.toString() : '0';
	} catch {
		return '0';
	}
};

/** Read the complete, admin-only overview without per-category/order queries. */
export async function getAdminDashboardMetrics(
	db: D1Database,
	restaurantId: string,
): Promise<AdminDashboardMetrics> {
	const row = await db
		.prepare(adminDashboardMetricsQuery)
		.bind(restaurantId)
		.first<DashboardRow>();
	return {
		currency: typeof row?.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : 'USD',
		currencyMinorUnit: Math.min(4, count(row?.currencyMinorUnit)),
		currencyLocale: typeof row?.currencyLocale === 'string' && row.currencyLocale ? row.currencyLocale : 'en',
		categoryCount: count(row?.categoryCount),
		itemCount: count(row?.itemCount),
		unavailableItemCount: count(row?.unavailableItemCount),
		optionCount: count(row?.optionCount),
		suggestionCount: count(row?.suggestionCount),
		beveragePromptCount: count(row?.beveragePromptCount),
		beverageTargetCount: count(row?.beverageTargetCount),
		tableCount: count(row?.tableCount),
		enabledTableCount: count(row?.enabledTableCount),
		ordersToday: count(row?.ordersToday),
		completedToday: count(row?.completedToday),
		cancelledToday: count(row?.cancelledToday),
		salesTodayMinor: minor(row?.salesTodayMinor),
		revenueTodayMinor: minor(row?.revenueTodayMinor),
		newOrders: count(row?.newOrders),
		acceptedOrders: count(row?.acceptedOrders),
		preparingOrders: count(row?.preparingOrders),
		readyOrders: count(row?.readyOrders),
	};
}

/** Managers can maintain the menu, but must not receive order or table metrics. */
export async function getMenuDashboardMetrics(
	db: D1Database,
	restaurantId: string,
): Promise<MenuDashboardMetrics> {
	const row = await db
		.prepare(menuDashboardMetricsQuery)
		.bind(restaurantId)
		.first<DashboardRow>();
	return {
		currency: typeof row?.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : 'USD',
		currencyMinorUnit: Math.min(4, count(row?.currencyMinorUnit)),
		currencyLocale: typeof row?.currencyLocale === 'string' && row.currencyLocale ? row.currencyLocale : 'en',
		categoryCount: count(row?.categoryCount),
		itemCount: count(row?.itemCount),
		unavailableItemCount: count(row?.unavailableItemCount),
		optionCount: count(row?.optionCount),
		suggestionCount: count(row?.suggestionCount),
		beveragePromptCount: count(row?.beveragePromptCount),
		beverageTargetCount: count(row?.beverageTargetCount),
	};
}
