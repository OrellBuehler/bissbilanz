import { handleWebCallback } from '$lib/server/auth-callback';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies, getClientAddress, request }) =>
	handleWebCallback({
		providerId: params.provider,
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		cookies,
		request,
		clientAddress: getClientAddress()
	});
