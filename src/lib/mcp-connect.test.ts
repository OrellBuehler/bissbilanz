import { describe, it, expect } from 'vitest';
import { claudeInstallUrl, claudePrefillUrl, mcpServerUrl, qrPath } from './mcp-connect';

describe('mcpServerUrl', () => {
	it('appends the MCP path and tolerates a trailing slash', () => {
		expect(mcpServerUrl('https://bissbilanz.orellbuehler.ch')).toBe(
			'https://bissbilanz.orellbuehler.ch/api/mcp'
		);
		expect(mcpServerUrl('https://bissbilanz.orellbuehler.ch/')).toBe(
			'https://bissbilanz.orellbuehler.ch/api/mcp'
		);
	});
});

describe('claudePrefillUrl', () => {
	it('opens the add-custom-connector dialog with the server URL percent-encoded', () => {
		expect(claudePrefillUrl('https://bissbilanz.orellbuehler.ch/api/mcp')).toBe(
			'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Bissbilanz&connectorUrl=https%3A%2F%2Fbissbilanz.orellbuehler.ch%2Fapi%2Fmcp'
		);
	});

	it('is what the install link resolves to while there is no directory listing', () => {
		const serverUrl = 'https://example.test/api/mcp';
		expect(claudeInstallUrl(serverUrl)).toBe(claudePrefillUrl(serverUrl));
	});
});

describe('qrPath', () => {
	it('draws one square module per dark cell inside a square grid', () => {
		const { size, path } = qrPath('https://claude.ai/customize/connectors');
		expect(size).toBeGreaterThanOrEqual(21);
		expect(path.startsWith('M')).toBe(true);
		const modules = path.split('z').filter(Boolean);
		expect(modules.length).toBeGreaterThan(size);
		expect(modules.length).toBeLessThan(size * size);
		expect(modules.every((module) => /^M\d+ \d+h1v1h-1$/.test(module))).toBe(true);
	});

	it('produces different codes for different input', () => {
		expect(qrPath('a').path).not.toBe(qrPath('b').path);
	});
});
