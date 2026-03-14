import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { oauthClients } from '$lib/server/schema';

const DB_NAME = 'test_seed_data';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('seed data integrity', () => {
	it('seeds bissbilanz-android OAuth client via migration 0024', async () => {
		const db = getTestDB(dbUrl);
		const client = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, 'bissbilanz-android')
		});
		expect(client).toBeDefined();
		expect(client!.clientName).toBe('Bissbilanz Android');
		expect(client!.tokenEndpointAuthMethod).toBe('none');
		expect(client!.allowedRedirectUris).toEqual(['bissbilanz://oauth/callback']);
	});

	it('seeds bissbilanz-ios OAuth client via migration 0024', async () => {
		const db = getTestDB(dbUrl);
		const client = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, 'bissbilanz-ios')
		});
		expect(client).toBeDefined();
		expect(client!.clientName).toBe('Bissbilanz iOS');
		expect(client!.tokenEndpointAuthMethod).toBe('none');
		expect(client!.allowedRedirectUris).toEqual(['bissbilanz://oauth/callback']);
	});
});
