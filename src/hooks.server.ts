import type { Handle } from '@sveltejs/kit';
import { getDB, PRIMARY_RESTAURANT_ID } from '$lib/server/db';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.restaurantId = PRIMARY_RESTAURANT_ID;
	event.locals.user = null;

	// D1 is only available where a platform binding exists (all real routes).
	if (event.platform?.env?.DB) {
		const db = getDB(event.platform);
		const token = event.cookies.get(SESSION_COOKIE);
		try {
			event.locals.user = await resolveSession(db, token);
			if (event.locals.user) event.locals.restaurantId = event.locals.user.restaurantId;
		} catch {
			event.locals.user = null;
		}
	}

	return resolve(event);
};
