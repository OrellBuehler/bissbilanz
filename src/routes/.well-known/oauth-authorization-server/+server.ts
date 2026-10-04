import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizationServerMetadata } from '$lib/server/oauth-metadata';

export const GET: RequestHandler = async ({ url }) => json(authorizationServerMetadata(url));
