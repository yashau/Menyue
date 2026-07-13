export function restaurantId(env: { RESTAURANT_ID?: string }): string {
	const value = env.RESTAURANT_ID?.trim();
	return value && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : 'demo';
}

export function publicOrigin(event: { url: URL; platform?: App.Platform | undefined }): string {
	const configured = (event.platform?.env as { APP_ORIGIN?: string } | undefined)?.APP_ORIGIN;
	try {
		const candidate = new URL(configured ?? '');
		if (candidate.protocol === 'http:' || candidate.protocol === 'https:') return candidate.origin;
	} catch { /* use request origin */ }
	const origin = event.url.origin;
	return origin.replace('://0.0.0.0', '://localhost');
}
