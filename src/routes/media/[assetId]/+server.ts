import { error, type RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = async ({ params, platform }) => {
	const asset = await platform!.env.DB.prepare(
		"SELECT r2_key,content_type FROM media_assets WHERE id=? AND state='active'",
	)
		.bind(params.assetId)
		.first<{ r2_key: string; content_type: string }>();
	if (!asset) throw error(404);
	const object = await platform!.env.MEDIA.get(asset.r2_key);
	if (!object) throw error(404);
	return new Response(object.body, {
		headers: {
			'Content-Type': asset.content_type,
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff',
		},
	});
};
