import { type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, fetch }) => {
	return fetch('/api/oauth/token', {
		method: 'POST',
		headers: request.headers,
		body: await request.formData()
	});
};
