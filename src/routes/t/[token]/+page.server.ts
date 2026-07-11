import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';
import { loadGuestMenu, resolveTable } from '$lib/server/guest';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDB(platform);
	const table = await resolveTable(db, params.token);
	if (!table) {
		throw error(404, 'This table link is not active. Please ask a member of staff for help.');
	}
	const menu = await loadGuestMenu(db, table);
	return {
		token: params.token,
		restaurant: menu.restaurant,
		table: { id: table.id, label: table.label },
		categories: menu.categories,
		items: menu.items,
		currencies: menu.currencies,
		rates: menu.rates,
		beverage: menu.beverage
	};
};
