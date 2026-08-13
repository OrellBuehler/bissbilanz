import { handleMobileCallback } from '$lib/server/auth-callback';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, getClientAddress }) =>
	handleMobileCallback({
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		clientAddress: getClientAddress()
	});
