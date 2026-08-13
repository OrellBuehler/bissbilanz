import { handleFormPostCallback, handleWebCallback } from '$lib/server/auth-callback';
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

/** Sign in with Apple replies with response_mode=form_post. */
export const POST: RequestHandler = async ({ params, request, cookies, getClientAddress }) => {
	const form = await request.formData();
	return handleFormPostCallback({
		providerId: params.provider,
		code: form.get('code')?.toString() ?? null,
		state: form.get('state')?.toString() ?? null,
		appleUserField: form.get('user')?.toString() ?? null,
		cookies,
		request,
		clientAddress: getClientAddress()
	});
};
