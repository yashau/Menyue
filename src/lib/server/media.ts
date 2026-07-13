const match = (b: Uint8Array, at: number, s: number[]) => s.every((v, i) => b[at + i] === v);
const be = (b: Uint8Array, o: number) => b[o] * 256 + b[o + 1];
const le = (b: Uint8Array, o: number) => b[o] + b[o + 1] * 256;
export const imageContentType = (
	bytes: Uint8Array,
): 'image/png' | 'image/jpeg' | 'image/webp' | null => {
	if (match(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
	if (match(bytes, 0, [255, 216, 255])) return 'image/jpeg';
	if (match(bytes, 0, [82, 73, 70, 70]) && match(bytes, 8, [87, 69, 66, 80])) return 'image/webp';
	return null;
};
export const imagePixels = (
	bytes: Uint8Array,
	contentType: ReturnType<typeof imageContentType>,
) => {
	if (contentType === 'image/png' && bytes.length >= 24)
		return (
			(bytes[16] * 2 ** 24 + bytes[17] * 2 ** 16 + bytes[18] * 256 + bytes[19]) *
			(bytes[20] * 2 ** 24 + bytes[21] * 2 ** 16 + bytes[22] * 256 + bytes[23])
		);
	if (contentType === 'image/jpeg') {
		for (let i = 2; i + 9 < bytes.length; i++)
			if (bytes[i] === 255 && bytes[i + 1] >= 192 && bytes[i + 1] <= 195)
				return be(bytes, i + 5) * be(bytes, i + 7);
	}
	if (contentType === 'image/webp') {
		if (
			bytes.slice(12, 16).every((value, index) => value === [86, 80, 56, 88][index]) &&
			bytes.length >= 30
		)
			return (
				(1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536) *
				(1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536)
			);
		if (
			bytes.slice(12, 16).every((value, index) => value === [86, 80, 56, 76][index]) &&
			bytes.length >= 25
		)
			return (
				(1 + bytes[21] + (bytes[22] & 63) * 256) *
				(1 + (bytes[22] >> 6) + bytes[23] * 4 + (bytes[24] & 15) * 1024)
			);
		// A lossy VP8 frame stores its 14-bit dimensions little-endian directly
		// after the key-frame start code (9d 01 2a).
		for (let i = 20; i + 6 < bytes.length; i++)
			if (match(bytes, i, [157, 1, 42]))
				return (le(bytes, i + 3) & 0x3fff) * (le(bytes, i + 5) & 0x3fff);
	}
	return 0;
};
export async function uploadImage(
	db: D1Database,
	bucket: R2Bucket,
	file: File,
	restaurantId: string,
): Promise<string> {
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
		throw new Error('Use a JPEG, PNG or WebP under 5 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const contentType = imageContentType(bytes);
	if (!contentType || contentType !== file.type)
		throw new Error('Image content does not match its type.');
	const pixels = imagePixels(bytes, contentType);
	if (!pixels || pixels > 40_000_000) throw new Error('Image dimensions are invalid or too large.');
	const id = crypto.randomUUID(),
		key = `media/${encodeURIComponent(restaurantId)}/${crypto.randomUUID()}`;
	const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
	await bucket.put(key, bytes, { httpMetadata: { contentType } });
	try {
		await db
			.prepare(
				'INSERT INTO media_assets(id,restaurant_id,r2_key,content_type,bytes,sha256) VALUES(?,?,?,?,?,?)',
			)
			.bind(id, restaurantId, key, contentType, file.size, hash)
			.run();
	} catch (e) {
		await bucket.delete(key);
		throw e;
	}
	return id;
}
