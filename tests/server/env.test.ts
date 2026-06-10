import { describe, expect, test } from 'vitest';
import { parseDatabaseConfig, validateEnv } from '../../src/lib/server/env';

describe('parseDatabaseConfig', () => {
	test('uses defaults when env vars are missing', () => {
		const config = parseDatabaseConfig({
			DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz'
		});

		expect(config.poolMax).toBe(5);
		expect(config.idleTimeoutSeconds).toBe(20);
		expect(config.connectTimeoutSeconds).toBe(10);
		expect(config.statementTimeoutMs).toBe(30_000);
		expect(config.maxLifetimeSeconds).toBe(300);
		expect(config.applicationName).toBe('bissbilanz');
	});

	test('parses numeric overrides', () => {
		const config = parseDatabaseConfig({
			DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz',
			DATABASE_POOL_MAX: '25',
			DATABASE_IDLE_TIMEOUT_SECONDS: '60',
			DATABASE_CONNECT_TIMEOUT_SECONDS: '5',
			DATABASE_STATEMENT_TIMEOUT_MS: '5000',
			DATABASE_MAX_LIFETIME_SECONDS: '600',
			DATABASE_APPLICATION_NAME: 'bissbilanz-prod'
		});

		expect(config.poolMax).toBe(25);
		expect(config.idleTimeoutSeconds).toBe(60);
		expect(config.connectTimeoutSeconds).toBe(5);
		expect(config.statementTimeoutMs).toBe(5000);
		expect(config.maxLifetimeSeconds).toBe(600);
		expect(config.applicationName).toBe('bissbilanz-prod');
	});
});

describe('validateEnv', () => {
	const validEnv = {
		DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz',
		INFOMANIAK_CLIENT_ID: 'client-id',
		INFOMANIAK_CLIENT_SECRET: 'client-secret',
		INFOMANIAK_REDIRECT_URI: 'https://app.example.com/api/auth/callback',
		SESSION_SECRET: 'a'.repeat(44),
		PUBLIC_APP_URL: 'https://app.example.com'
	};

	test('returns no problems for a valid env', () => {
		expect(validateEnv(validEnv)).toEqual([]);
	});

	test('reports every missing required var', () => {
		const problems = validateEnv({});
		expect(problems).toContain('DATABASE_URL is required');
		expect(problems).toContain('INFOMANIAK_CLIENT_ID is required');
		expect(problems).toContain('INFOMANIAK_CLIENT_SECRET is required');
		expect(problems).toContain('INFOMANIAK_REDIRECT_URI is required');
		expect(problems).toContain('SESSION_SECRET is required');
		expect(problems).toContain('PUBLIC_APP_URL is required');
	});

	test('rejects short SESSION_SECRET', () => {
		expect(validateEnv({ ...validEnv, SESSION_SECRET: 'short' })).toContain(
			'SESSION_SECRET must be at least 32 characters'
		);
	});

	test('rejects non-postgres DATABASE_URL', () => {
		expect(validateEnv({ ...validEnv, DATABASE_URL: 'mysql://x' })).toContain(
			'DATABASE_URL must be a postgres:// connection string'
		);
	});

	test('rejects TEST_MODE in production', () => {
		expect(validateEnv({ ...validEnv, TEST_MODE: 'true', NODE_ENV: 'production' })).toContain(
			'TEST_MODE must not be enabled in production'
		);
	});

	test('allows TEST_MODE outside production when TEST_AUTH_TOKEN is set', () => {
		expect(validateEnv({ ...validEnv, TEST_MODE: 'true', TEST_AUTH_TOKEN: 'some-token' })).toEqual(
			[]
		);
	});

	test('requires TEST_AUTH_TOKEN when TEST_MODE is enabled', () => {
		expect(validateEnv({ ...validEnv, TEST_MODE: 'true' })).toContain(
			'TEST_AUTH_TOKEN is required when TEST_MODE is enabled'
		);
	});
});
