import type { LayoutServerLoad } from './$types';
import { config } from '$lib/server/env';

export const load: LayoutServerLoad = async () => {
	return {
		mcpEnabled: config.mcp.enabled
	};
};
