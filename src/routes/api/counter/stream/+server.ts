import { type RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.counter) return new Response('Unauthorized', { status: 401 });
	return platform!.env.ORDER_HUB.getByName(locals.counter.restaurantId).fetch(
		new Request(request.url, { headers: { Upgrade: 'websocket' } }),
	);
};
