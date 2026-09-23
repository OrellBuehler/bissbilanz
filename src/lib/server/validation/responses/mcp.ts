import 'zod-openapi';
import { z } from 'zod';

export const mcpStatusResponseSchema = z
	.object({
		// Whether the user has at least one MCP client (e.g. Claude.ai, Claude
		// Code) authorized against their account — see the "Connected Apps"
		// list on Settings → MCP (`listAuthorizedClients`).
		connected: z.boolean()
	})
	.meta({ id: 'McpStatusResponse' });
