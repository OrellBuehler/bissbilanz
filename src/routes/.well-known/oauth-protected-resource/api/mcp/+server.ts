import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { config } from '$lib/server/env';

const REQUIRED_SCOPE = 'mcp:access';

function getBaseUrl(url: URL): string {
	const base = config.app.url || url.origin;
	return base.replace(/\/$/, '');
}

export const GET: RequestHandler = async ({ url }) => {
	const baseUrl = getBaseUrl(url);

	return json({
		resource: `${baseUrl}/api/mcp`,
		authorization_servers: [baseUrl],
		scopes_supported: [REQUIRED_SCOPE],
		bearer_methods_supported: ['header'],
		resource_name: 'Bissbilanz MCP'
	});
};
