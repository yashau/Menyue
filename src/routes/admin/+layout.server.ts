import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}
	// Authenticated but wrong role (e.g. counter staff) → genuine permission error.
	if (locals.user.role === 'counter') {
		throw error(403, 'You do not have permission to access the admin workspace.');
	}
	return {
		user: {
			displayName: locals.user.displayName,
			username: locals.user.username,
			role: locals.user.role
		},
		csrf: locals.user.csrfSecret,
		isAdmin: locals.user.role === 'admin'
	};
};
