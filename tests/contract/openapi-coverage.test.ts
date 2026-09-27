import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import { generateSpec } from '../../src/lib/server/openapi';

// Every /api handler must be in the OpenAPI spec so the breaking-change check
// (scripts/api/check-breaking.sh) protects it. Routes outside the spec are
// listed here with the reason they are exempt; shrink this list, don't grow it.
const UNDOCUMENTED: Record<string, string> = {
	// Governed by external specs (MCP, OAuth 2.1) rather than our OpenAPI document.
	'GET /api/mcp': 'MCP transport — tool surface is covered by docs/mcp-tools.json',
	'POST /api/mcp': 'MCP transport — tool surface is covered by docs/mcp-tools.json',
	'DELETE /api/mcp': 'MCP transport — tool surface is covered by docs/mcp-tools.json',
	'GET /api/oauth/authorize': 'OAuth 2.1 authorization endpoint (browser redirect)',
	'POST /api/oauth/token': 'OAuth 2.1 token endpoint',

	// Web sign-in flow: browser redirects, deployed together with the server.
	'GET /api/auth/login': 'web OIDC redirect',
	'GET /api/auth/callback': 'web OIDC redirect',
	'GET /api/auth/callback/{}': 'web OIDC redirect',
	'POST /api/auth/callback/{}': 'web OIDC form_post (Apple)',
	'POST /api/auth/logout': 'web session',
	'GET /api/auth/me': 'web session',
	'GET /api/auth/identities': 'web account settings',
	'DELETE /api/auth/identities/{}': 'web account settings',
	'POST /api/auth/test-session': 'e2e test helper, disabled in production',

	// Web push, only used by the PWA.
	'GET /api/push/vapid-public-key': 'web push',
	'POST /api/push/subscriptions': 'web push',
	'DELETE /api/push/subscriptions': 'web push',
	'POST /api/push/test': 'web push',

	'GET /api/health': 'liveness probe',
	'GET /api/day-properties/{}': 'not used by any client yet',
	'PUT /api/day-properties/{}': 'not used by any client yet',
	'DELETE /api/day-properties/{}': 'not used by any client yet',

	// Mobile sign-in. Used by shipped apps, so changes here are breaking even
	// though no tool catches them — TODO: move into the spec.
	'GET /api/auth/providers': 'mobile sign-in — TODO document',
	'GET /api/auth/mobile/login': 'mobile sign-in redirect',
	'GET /api/auth/mobile/callback': 'mobile sign-in redirect',
	'GET /api/auth/mobile/callback/{}': 'mobile sign-in redirect',
	'POST /api/auth/mobile/callback/{}': 'mobile sign-in form_post (Apple)',
	'POST /api/auth/mobile/token': 'mobile sign-in — TODO document',
	'POST /api/auth/mobile/apple': 'native Sign in with Apple — TODO document'
};

const ROUTES_DIR = 'src/routes/api';

function findRouteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return findRouteFiles(path);
		return entry.name === '+server.ts' ? [path] : [];
	});
}

function implementedOperations(): string[] {
	return findRouteFiles(ROUTES_DIR).flatMap((file) => {
		const dir = relative(ROUTES_DIR, file).split(sep).slice(0, -1);
		const path = ['/api', ...dir].join('/').replace(/\[[^\]]+\]/g, '{}');
		const source = readFileSync(file, 'utf8');
		const methods = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)];
		return methods.map(([, method]) => `${method} ${path}`);
	});
}

function documentedOperations(): Set<string> {
	const spec = generateSpec();
	return new Set(
		Object.entries(spec.paths ?? {}).flatMap(([path, item]) =>
			Object.keys(item ?? {})
				.filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
				.map((method) => `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{}')}`)
		)
	);
}

describe('OpenAPI coverage', () => {
	const implemented = implementedOperations();
	const documented = documentedOperations();

	test('finds the route handlers', () => {
		expect(implemented.length).toBeGreaterThan(50);
	});

	test('every /api handler is documented or explicitly exempt', () => {
		const missing = implemented.filter((op) => !documented.has(op) && !(op in UNDOCUMENTED));
		expect(missing, 'add these to src/lib/server/openapi.ts').toEqual([]);
	});

	test('every documented operation has a handler', () => {
		const implementedSet = new Set(implemented);
		expect([...documented].filter((op) => !implementedSet.has(op))).toEqual([]);
	});

	test('the exemption list has no stale entries', () => {
		const implementedSet = new Set(implemented);
		const stale = Object.keys(UNDOCUMENTED).filter(
			(op) => !implementedSet.has(op) || documented.has(op)
		);
		expect(stale, 'remove these from UNDOCUMENTED').toEqual([]);
	});
});
