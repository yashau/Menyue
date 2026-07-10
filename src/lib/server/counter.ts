export async function counterOrders(db: D1Database, restaurantId = 'demo') {
	const orders = await db
		.prepare(
			'SELECT o.id,o.display_number,o.status,o.note,o.total_minor,o.version,o.updated_at,t.label FROM orders o JOIN dining_tables t ON t.id=o.table_id WHERE o.restaurant_id=? ORDER BY o.updated_at DESC LIMIT 100',
		)
		.bind(restaurantId)
		.all<Record<string, unknown>>();
	for (const order of orders.results) {
		const lines = await db
			.prepare(
				'SELECT id,item_name,unit_minor,quantity,total_minor FROM order_lines WHERE order_id=?',
			)
			.bind(order.id)
			.all<Record<string, unknown>>();
		for (const line of lines.results)
			line.choices = (
				await db
					.prepare(
						'SELECT group_name,choice_name,price_delta_minor FROM order_line_choices WHERE line_id=?',
					)
					.bind(line.id)
					.all()
			).results;
		order.lines = lines.results;
	}
	return orders.results;
}
