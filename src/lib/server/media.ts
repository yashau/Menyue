const match = (b: Uint8Array, at: number, s: number[]) => s.every((v, i) => b[at + i] === v);
const be = (b: Uint8Array, o: number) => b[o] * 256 + b[o + 1];
export async function uploadImage(db: D1Database, bucket: R2Bucket, file: File): Promise<string> {
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
		throw new Error('Use a JPEG, PNG or WebP under 5 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const png = match(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]),
		jpeg = match(bytes, 0, [255, 216, 255]),
		webp = match(bytes, 0, [82, 73, 70, 70]) && match(bytes, 8, [87, 69, 66, 80]);
	if (!(png || jpeg || webp)) throw new Error('Image content does not match its type.');
	let pixels = 0;
	if (png && bytes.length >= 24)
		pixels =
			(bytes[16] * 2 ** 24 + bytes[17] * 2 ** 16 + bytes[18] * 256 + bytes[19]) *
			(bytes[20] * 2 ** 24 + bytes[21] * 2 ** 16 + bytes[22] * 256 + bytes[23]);
	if (jpeg) {
		for (let i = 2; i + 9 < bytes.length; i++) {
			if (bytes[i] === 255 && bytes[i + 1] >= 192 && bytes[i + 1] <= 195) {
				pixels = be(bytes, i + 5) * be(bytes, i + 7);
				break;
			}
		}
	}
	if (pixels > 40_000_000) throw new Error('Image dimensions are too large.');
	const id = crypto.randomUUID(),
		key = `media/${crypto.randomUUID()}`;
	const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
	await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } });
	try {
		await db
			.prepare('INSERT INTO media_assets(id,r2_key,content_type,bytes,sha256) VALUES(?,?,?,?,?)')
			.bind(id, key, file.type, file.size, hash)
			.run();
	} catch (e) {
		await bucket.delete(key);
		throw e;
	}
	return id;
}
