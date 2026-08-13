import { handleMobileCallback } from '$lib/server/auth-callback';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, getClientAddress }) =>
	handleMobileCallback({
		code: url.searchParams.get('code'),
		state: url.searchParams.get('state'),
		clientAddress: getClientAddress()
	});

/** Sign in with Apple replies with response_mode=form_post. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const form = await request.formData();
	return handleMobileCallback({
		code: form.get('code')?.toString() ?? null,
		state: form.get('state')?.toString() ?? null,
		clientAddress: getClientAddress()
	});
};
