import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Serve an uploaded image from R2. Public (menu photos are public content).
export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
	const bucket = platform?.env?.MEDIA;
	if (!bucket) throw error(500, 'Media storage unavailable');
	const key = params.key;
	if (!key) throw error(404, 'Not found');

	const obj = await bucket.get(key);
	if (!obj) throw error(404, 'Image not found');

	setHeaders({
		'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
		'cache-control': 'public, max-age=31536000, immutable',
		etag: obj.httpEtag
	});
	return new Response(obj.body as ReadableStream);
};
