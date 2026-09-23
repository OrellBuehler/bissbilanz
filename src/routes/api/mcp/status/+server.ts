import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAuthorizedClients } from '$lib/server/oauth';
import { handleApiError, requireAuth } from '$lib/server/errors';

/**
 * Whether the signed-in user has at least one MCP client (e.g. Claude.ai,
 * Claude Code) authorized against their account. The AI meal task queue is
 * only ever picked up by such a client, so this is what lets a client decide
 * whether "send to assistant" can do anything.
 *
 * Mirrors the "Connected Apps" list on the Settings → MCP page
 * (`listAuthorizedClients`) — not the mobile/web app's own session, which
 * authenticates through a fixed client id and never appears there (see
 * `mobile-auth.ts`).
 *
 * MCP being disabled server-wide already 404s every `/api/mcp*` path in
 * `hooks.server.ts`, so there's nothing to gate here beyond authentication.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const clients = await listAuthorizedClients(userId);
		return json({ connected: clients.length > 0 });
	} catch (error) {
		return handleApiError(error);
	}
};
