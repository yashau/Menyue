import { json, type RequestHandler } from '@sveltejs/kit';
import { getPublicMenu } from '$lib/server/menu';
export const GET: RequestHandler = async ({ platform }) =>
	json(await getPublicMenu(platform!.env.DB), {
		headers: { 'Cache-Control': 'public, max-age=60' },
	});
