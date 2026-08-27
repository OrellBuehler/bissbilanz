import { handleMobileCallback } from '$lib/server/auth-callback';
import { getRequestIp } from '$lib/server/client-ip';
import type { RequestHandler } from './$types';

/** Legacy fixed path, kept because it is the registered Infomaniak redirect URI. */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	return handleMobileCallback({
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		clientAddress: getRequestIp(event)
	});
};
