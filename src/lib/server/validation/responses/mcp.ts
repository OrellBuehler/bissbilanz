import 'zod-openapi';
import { z } from 'zod';

export const mcpClientSchema = z
	.object({
		name: z.string(),
		// Host that served the client's metadata document (CIMD URL client ids),
		// null for pre-registered clients.
		host: z.string().nullable()
	})
	.meta({ id: 'McpClient' });

export const mcpStatusResponseSchema = z
	.object({
		// Whether the user has at least one MCP client (e.g. Claude.ai, Claude
		// Code) authorized against their account — see the "Connected Apps"
		// list on Settings → MCP (`listAuthorizedClients`).
		connected: z.boolean(),
		// The authorized clients behind `connected`, so apps can show who is
		// connected. Optional for clients decoding older server responses.
		clients: z.array(mcpClientSchema).optional()
	})
	.meta({ id: 'McpStatusResponse' });
