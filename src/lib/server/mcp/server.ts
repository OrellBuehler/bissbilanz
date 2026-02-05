import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const createMcpServer = () => {
	return new McpServer({ name: 'bissbilanz', version: '0.1.0' });
};
