import { json, type RequestHandler } from '@sveltejs/kit';

/** A small, unauthenticated identity probe for local tooling; it is not a health claim about dependencies. */
export const GET: RequestHandler = () => json({ service: 'menyue', runtime: 'web' });
