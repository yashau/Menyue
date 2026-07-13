import type { PageServerLoad } from './$types';
import { getPublicMenu } from '$lib/server/menu';
import { restaurantId } from '$lib/server/restaurant';
export const load: PageServerLoad = async ({ platform }) => ({
	menu: await getPublicMenu(platform!.env.DB, restaurantId(platform!.env)),
});
