import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sha256 } from '$lib/server/auth';
import { getPublicMenu } from '$lib/server/menu';
export const load: PageServerLoad = async ({ params, platform }) => {
	const table = await platform!.env.DB.prepare(
		'SELECT id,label,restaurant_id FROM dining_tables WHERE token_hash=? AND enabled=1',
	)
		.bind(await sha256(params.token))
		.first<{ id: string; label: string; restaurant_id: string }>();
	if (!table) throw error(404, 'This table link is unavailable.');
	return {
		table: { label: table.label },
		menu: await getPublicMenu(platform!.env.DB, table.restaurant_id),
	};
};
