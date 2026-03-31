import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { join } from 'node:path';
import * as schema from '$lib/server/schema';

type TestDB = ReturnType<typeof drizzle<typeof schema>>;

const dbInstances = new Map<string, { db: TestDB; client: ReturnType<typeof postgres> }>();

export function getTestDB(url: string) {
	const existing = dbInstances.get(url);
	if (existing) return existing.db;

	const client = postgres(url);
	const db = drizzle(client, { schema });
	dbInstances.set(url, { db, client });
	return db;
}

export async function closeTestDB(url: string) {
	const existing = dbInstances.get(url);
	if (existing) {
		await existing.client.end();
		dbInstances.delete(url);
	}
}

export async function runTestMigrations(url: string) {
	const db = getTestDB(url);
	await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
	return db;
}

export async function createTestDatabase(name: string): Promise<string> {
	const rootUrl = process.env.TEST_DATABASE_URL!;
	const client = postgres(rootUrl);
	try {
		await client.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
		await client.unsafe(`CREATE DATABASE "${name}"`);
	} finally {
		await client.end();
	}

	const url = new URL(rootUrl);
	url.pathname = `/${name}`;
	return url.toString();
}

export async function dropTestDatabase(name: string) {
	const rootUrl = process.env.TEST_DATABASE_URL!;
	const client = postgres(rootUrl);
	try {
		await client.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	} finally {
		await client.end();
	}
}
