import { requireCapability } from '$lib/server/permissions';
import { requireCsrf } from '$lib/server/auth';
import { uploadImage } from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCapability(locals, 'hero:write');
	return {
		hero: await platform!.env.DB.prepare(
			'SELECT title,description,cta_label,cta_url FROM site_content WHERE restaurant_id=?',
		)
			.bind('demo')
			.first(),
	};
};
export const actions: Actions = {
	save: async (event) => {
		requireCapability(event.locals, 'hero:write');
		await requireCsrf(event);
		const f = await event.request.formData(),
			photo = f.get('photo');
		let asset: string | null = null;
		if (photo instanceof File && photo.size)
			asset = await uploadImage(event.platform!.env.DB, event.platform!.env.MEDIA, photo);
		await event
			.platform!.env.DB.prepare(
				'UPDATE site_content SET title=?,description=?,cta_label=?,cta_url=?,hero_asset_id=COALESCE(?,hero_asset_id) WHERE restaurant_id=?',
			)
			.bind(
				String(f.get('title') ?? ''),
				String(f.get('description') ?? ''),
				String(f.get('ctaLabel') ?? ''),
				String(f.get('ctaUrl') ?? ''),
				asset,
				'demo',
			)
			.run();
		await event
			.platform!.env.DB.prepare('UPDATE restaurants SET hero_revision=hero_revision+1 WHERE id=?')
			.bind('demo')
			.run();
	},
};
