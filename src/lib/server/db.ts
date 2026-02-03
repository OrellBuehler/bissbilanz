import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './env';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;

export function getDB() {
	if (!db) {
		const client = postgres(config.database.url);
		db = drizzle(client, { schema });
	}
	return db;
}

// Re-export schema for convenience
export * from './schema';
