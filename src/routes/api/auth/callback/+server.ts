import { handleWebCallback } from '$lib/server/auth-callback';
import { getRequestIp } from '$lib/server/client-ip';
import type { RequestHandler } from './$types';

/**
 * Infomaniak's redirect URI predates the per-provider callback paths and is
 * registered in their console, so it stays at this fixed path.
 */
export const GET: RequestHandler = async (event) => {
	const { url, cookies, request } = event;
	return handleWebCallback({
		providerId: 'infomaniak',
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		cookies,
		request,
		clientAddress: getRequestIp(event)
	});
};
