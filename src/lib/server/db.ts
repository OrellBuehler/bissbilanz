import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './env';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;

export function getDB() {
	if (!db) {
		const client = postgres(config.database.url, {
			max: config.database.poolMax,
			idle_timeout: config.database.idleTimeoutSeconds,
			connect_timeout: config.database.connectTimeoutSeconds,
			max_lifetime: config.database.maxLifetimeSeconds,
			connection: {
				application_name: config.database.applicationName,
				statement_timeout: config.database.statementTimeoutMs
			}
		});
		db = drizzle(client, { schema });
	}
	return db;
}

// Re-export schema for convenience
export * from './schema';
