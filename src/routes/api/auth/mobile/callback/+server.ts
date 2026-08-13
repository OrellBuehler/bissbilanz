import { handleMobileCallback } from '$lib/server/auth-callback';
import type { RequestHandler } from './$types';

/** Legacy fixed path, kept because it is the registered Infomaniak redirect URI. */
export const GET: RequestHandler = async ({ url, getClientAddress }) =>
	handleMobileCallback({
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		clientAddress: getClientAddress()
	});
