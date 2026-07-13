import { isSafeCustomerMenuImageUrl } from '$lib/customer-menu';
import type { RequestHandler } from '@sveltejs/kit';

const fallback = () =>
	new Response(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" role="img" aria-label="Image unavailable"><rect width="16" height="9" fill="#eee4d4"/><path d="m3 6 2-2 2 1 2-2 4 3" fill="none" stroke="#b8755b" stroke-width=".45"/></svg>',
		{ headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
	);

export const GET: RequestHandler = async ({ fetch, url }) => {
	const source = url.searchParams.get('src');
	if (!source || !isSafeCustomerMenuImageUrl(source)) return fallback();
	const asset = await fetch(new URL(source, url.origin));
	const contentType = asset.headers.get('content-type') ?? '';
	if (!asset.ok || !contentType.startsWith('image/')) return fallback();
	return new Response(asset.body, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff',
		},
	});
};
