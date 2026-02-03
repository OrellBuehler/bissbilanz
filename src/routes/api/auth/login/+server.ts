import { redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const authUrl = new URL('https://login.infomaniak.com/authorize');
	authUrl.searchParams.set('client_id', config.infomaniak.clientId);
	authUrl.searchParams.set('redirect_uri', config.infomaniak.redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', 'openid email profile');

	throw redirect(302, authUrl.toString());
};
