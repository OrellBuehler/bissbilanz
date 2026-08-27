import { handleMobileCallback } from '$lib/server/auth-callback';
import { getRequestIp } from '$lib/server/client-ip';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { url } = event;
	return handleMobileCallback({
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		clientAddress: getRequestIp(event)
	});
};

/** Sign in with Apple replies with response_mode=form_post. */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const form = await request.formData();
	return handleMobileCallback({
		code: form.get('code')?.toString() ?? null,
		state: form.get('state')?.toString() ?? null,
		clientAddress: getRequestIp(event)
	});
};
