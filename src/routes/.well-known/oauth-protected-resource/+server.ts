import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { protectedResourceMetadata } from '$lib/server/oauth-metadata';

export const GET: RequestHandler = async ({ url }) => json(protectedResourceMetadata(url));
