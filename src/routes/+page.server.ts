import type { PageServerLoad } from './$types';
import { getPublicMenu } from '$lib/server/menu';
export const load: PageServerLoad = async ({ platform }) => ({
	menu: await getPublicMenu(platform!.env.DB),
});
