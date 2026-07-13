// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: {
				id: string;
				username: string;
				role: import('$lib/types').Role;
				csrf: string;
				mustChange?: boolean;
			};
			counter?: {
				csrf: string;
				operatorId: string;
				displayName: string;
				restaurantId: string;
			};
		}
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
