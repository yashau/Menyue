import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertCsrf, randomToken, requireMenuEditor } from '$lib/server/auth';

const ALLOWED: Record<string, string> = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png'
};
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB (already cropped/resized client-side)

// Accepts an already-cropped image blob and stores it in R2. Returns its key.
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const user = requireMenuEditor(locals.user);
	assertCsrf(user, request.headers.get('x-csrf'));

	const bucket = platform?.env?.MEDIA;
	if (!bucket) throw error(500, 'Media storage unavailable');

	const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
	const ext = ALLOWED[contentType];
	if (!ext) throw error(415, 'Unsupported image type. Use WebP, JPEG or PNG.');

	const buf = await request.arrayBuffer();
	if (buf.byteLength === 0) throw error(400, 'Empty upload.');
	if (buf.byteLength > MAX_BYTES) throw error(413, 'Image is too large.');

	const key = `items/${randomToken(16)}.${ext}`;
	await bucket.put(key, buf, { httpMetadata: { contentType } });
	return json({ key });
};
