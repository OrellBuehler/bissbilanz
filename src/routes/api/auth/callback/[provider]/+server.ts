import { handleFormPostCallback, handleWebCallback } from '$lib/server/auth-callback';
import { getRequestIp } from '$lib/server/client-ip';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { params, url, cookies, request } = event;
	return handleWebCallback({
		providerId: params.provider,
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		cookies,
		request,
		clientAddress: getRequestIp(event)
	});
};

/** Sign in with Apple replies with response_mode=form_post. */
export const POST: RequestHandler = async (event) => {
	const { params, request, cookies } = event;
	const form = await request.formData();
	return handleFormPostCallback({
		providerId: params.provider,
		code: form.get('code')?.toString() ?? null,
		state: form.get('state')?.toString() ?? null,
		appleUserField: form.get('user')?.toString() ?? null,
		cookies,
		request,
		clientAddress: getRequestIp(event)
	});
};
