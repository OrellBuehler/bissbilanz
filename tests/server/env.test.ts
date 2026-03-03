import { describe, expect, test } from 'vitest';
import { parseDatabaseConfig } from '../../src/lib/server/env';

describe('parseDatabaseConfig', () => {
	test('uses defaults when env vars are missing', () => {
		const config = parseDatabaseConfig({
			DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz'
		});

		expect(config.poolMax).toBe(10);
		expect(config.idleTimeoutSeconds).toBe(30);
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
