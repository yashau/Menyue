import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user && url.pathname !== '/admin/login')
		throw redirect(303, `/admin/login?returnTo=${encodeURIComponent(url.pathname)}`);
	return { user: locals.user };
};
