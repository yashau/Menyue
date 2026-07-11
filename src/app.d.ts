import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { SessionUser } from '$lib/server/auth';

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			user: SessionUser | null;
			restaurantId: number;
		}
		interface PageData {}
		interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				MEDIA: R2Bucket;
				APP_ORIGIN?: string;
			};
			cf?: IncomingRequestCfProperties;
			ctx?: ExecutionContext;
		}
	}
}

export {};
