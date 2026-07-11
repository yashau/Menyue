import { BASE_URL } from '../playwright.config';
import { TABLE1 } from './helpers';

// Pre-compile the heavy dev routes so the first tests don't cold-compile under
// parallel image load (which otherwise destabilises the miniflare dev server).
export default async function globalSetup() {
	const warm = async (path: string) => {
		for (let i = 0; i < 30; i++) {
			try {
				const r = await fetch(`${BASE_URL}${path}`);
				if (r.ok) return;
			} catch {
				/* server still starting */
			}
			await new Promise((r) => setTimeout(r, 700));
		}
	};
	await warm('/login');
	await warm(`/t/${TABLE1}`);
	await warm('/img/warm?kind=food');
	// admin/counter redirect to login unauthenticated, but this still compiles
	// their SSR modules so the first real test doesn't cold-compile under load.
	await warm('/admin');
	await warm('/counter');
}
