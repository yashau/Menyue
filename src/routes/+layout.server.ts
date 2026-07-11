import type { LayoutServerLoad } from './$types';
import { getDB, PRIMARY_RESTAURANT_ID } from '$lib/server/db';
import { DEFAULT_THEME } from '$lib/theme';

export const load: LayoutServerLoad = async ({ platform, locals }) => {
	let theme = DEFAULT_THEME;
	let brand = { name: 'Menyue', logoKey: null as string | null };
	try {
		const db = getDB(platform);
		const row = await db
			.prepare('SELECT name, theme_primary, theme_accent, logo_key FROM restaurants WHERE id = ?')
			.bind(locals.restaurantId ?? PRIMARY_RESTAURANT_ID)
			.first<{ name: string; theme_primary: string; theme_accent: string; logo_key: string | null }>();
		if (row) {
			theme = { primary: row.theme_primary, accent: row.theme_accent };
			brand = { name: row.name, logoKey: row.logo_key };
		}
	} catch {
		/* defaults */
	}
	return { theme, brand };
};
