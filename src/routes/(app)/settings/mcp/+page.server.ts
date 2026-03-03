import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { parseSessionCookie, getSessionWithUser } from '$lib/server/session';
import {
	getOrCreateOAuthClient,
	regenerateClientSecret,
	addAllowedRedirectUri,
	listAuthorizedClients,
	revokeAuthorization
} from '$lib/server/oauth';
import { getDB, oauthClients } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { config } from '$lib/server/env';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!config.mcp.enabled) {
		throw error(404, 'Not Found');
	}

	const userId = locals.user!.id;

	try {
		const { client, secret } = await getOrCreateOAuthClient(userId);

		const serverUrl = config.app.url ? `${config.app.url}/api/mcp` : `${url.origin}/api/mcp`;

		const authorizedClients = await listAuthorizedClients(userId);

		return {
			clientId: client.clientId,
			clientSecret: secret,
			serverUrl,
			allowedRedirectUris: client.allowedRedirectUris,
			authorizedClients
		};
	} catch (error) {
		console.error('Failed to load MCP settings:', error);
		return fail(500, { error: 'Failed to load MCP settings' });
	}
};

function ensureMcpEnabled() {
	if (!config.mcp.enabled) {
		throw error(404, 'Not Found');
	}
}

export const actions = {
	regenerate: async ({ request, url }) => {
		ensureMcpEnabled();
		const sessionId = parseSessionCookie(request.headers.get('cookie'));
		if (!sessionId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const sessionData = await getSessionWithUser(sessionId);
		if (!sessionData) {
			return fail(401, { error: 'Invalid session' });
		}

		const userId = sessionData.user.id;

		try {
			const { client, secret } = await regenerateClientSecret(userId);

			const serverUrl = config.app.url ? `${config.app.url}/api/mcp` : `${url.origin}/api/mcp`;

			return {
				success: true,
				clientId: client.clientId,
				clientSecret: secret,
				serverUrl
			};
		} catch (error) {
			console.error('Failed to regenerate client secret:', error);
			return fail(500, { error: 'Failed to regenerate client secret' });
		}
	},

	addRedirectUri: async ({ request }) => {
		ensureMcpEnabled();
		const sessionId = parseSessionCookie(request.headers.get('cookie'));
		if (!sessionId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const sessionData = await getSessionWithUser(sessionId);
		if (!sessionData) {
			return fail(401, { error: 'Invalid session' });
		}

		const formData = await request.formData();
		const redirectUri = formData.get('redirectUri')?.toString().trim();

		if (!redirectUri) {
			return fail(400, { error: 'Redirect URI is required' });
		}

		try {
			const url = new URL(redirectUri);
			const isHttps = url.protocol === 'https:';
			const isLocalhost =
				url.protocol === 'http:' &&
				(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');

			if (!isHttps && !isLocalhost) {
				return fail(400, { error: 'Redirect URI must be HTTPS or localhost' });
			}
		} catch {
			return fail(400, { error: 'Invalid URL format' });
		}

		try {
			const db = getDB();
			const [client] = await db
				.select()
				.from(oauthClients)
				.where(eq(oauthClients.userId, sessionData.user.id))
				.limit(1);

			if (!client) {
				return fail(404, { error: 'OAuth client not found' });
			}

			await addAllowedRedirectUri(client.clientId, redirectUri);

			return { success: true, action: 'addRedirectUri' };
		} catch (error) {
			console.error('Failed to add redirect URI:', error);
			return fail(500, { error: 'Failed to add redirect URI' });
		}
	},

	revokeClient: async ({ request }) => {
		ensureMcpEnabled();
		const sessionId = parseSessionCookie(request.headers.get('cookie'));
		if (!sessionId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const sessionData = await getSessionWithUser(sessionId);
		if (!sessionData) {
			return fail(401, { error: 'Invalid session' });
		}

		const formData = await request.formData();
		const clientId = formData.get('clientId')?.toString();

		if (!clientId) {
			return fail(400, { error: 'Client ID is required' });
		}

		try {
			await revokeAuthorization(sessionData.user.id, clientId);
			return { success: true, action: 'revokeClient' };
		} catch (error) {
			console.error('Failed to revoke client:', error);
			return fail(500, { error: 'Failed to revoke client' });
		}
	},

	removeRedirectUri: async ({ request }) => {
		ensureMcpEnabled();
		const sessionId = parseSessionCookie(request.headers.get('cookie'));
		if (!sessionId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const sessionData = await getSessionWithUser(sessionId);
		if (!sessionData) {
			return fail(401, { error: 'Invalid session' });
		}

		const formData = await request.formData();
		const redirectUri = formData.get('redirectUri')?.toString();

		if (!redirectUri) {
			return fail(400, { error: 'Redirect URI is required' });
		}

		try {
			const db = getDB();
			const [client] = await db
				.select()
				.from(oauthClients)
				.where(eq(oauthClients.userId, sessionData.user.id))
				.limit(1);

			if (!client) {
				return fail(404, { error: 'OAuth client not found' });
			}

			const normalizedUri = redirectUri.replace(/\/$/, '');
			const updatedUris = client.allowedRedirectUris.filter((uri) => uri !== normalizedUri);

			await db
				.update(oauthClients)
				.set({ allowedRedirectUris: updatedUris })
				.where(eq(oauthClients.clientId, client.clientId));

			return { success: true, action: 'removeRedirectUri' };
		} catch (error) {
			console.error('Failed to remove redirect URI:', error);
			return fail(500, { error: 'Failed to remove redirect URI' });
		}
	}
} satisfies Actions;
