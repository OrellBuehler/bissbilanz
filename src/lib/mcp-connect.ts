import { encode } from 'uqr';

export const CLAUDE_DIRECTORY_URL: string | null = null;

export const CHATGPT_URL = 'https://chatgpt.com';

export const CONNECTOR_NAME = 'Bissbilanz';

export function mcpServerUrl(origin: string): string {
	return `${origin.replace(/\/$/, '')}/api/mcp`;
}

export function claudePrefillUrl(serverUrl: string): string {
	const params = new URLSearchParams({
		modal: 'add-custom-connector',
		connectorName: CONNECTOR_NAME,
		connectorUrl: serverUrl
	});
	return `https://claude.ai/customize/connectors?${params.toString()}`;
}

export function claudeInstallUrl(serverUrl: string): string {
	return CLAUDE_DIRECTORY_URL ?? claudePrefillUrl(serverUrl);
}

export function qrPath(value: string): { size: number; path: string } {
	const { data, size } = encode(value, { ecc: 'M', border: 0 });
	let path = '';
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (data[y][x]) path += `M${x} ${y}h1v1h-1z`;
		}
	}
	return { size, path };
}
