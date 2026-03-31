import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { join } from 'node:path';
import { config } from './env';
import { isTransientDbError } from './db-retry';
import * as schema from './schema';

export { isTransientDbError } from './db-retry';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let sql: ReturnType<typeof postgres> | null = null;
let db: Database | null = null;

function getClient() {
	if (!sql) {
		sql = postgres(config.database.url, {
			max: config.database.poolMax,
			idle_timeout: config.database.idleTimeoutSeconds ?? undefined,
			max_lifetime: config.database.maxLifetimeSeconds,
			connect_timeout: config.database.connectTimeoutSeconds,
			connection: {
				statement_timeout: config.database.statementTimeoutMs,
				application_name: config.database.applicationName
			}
		});
	}
	return sql;
}

export function getDB(): Database {
	if (!db) {
		db = drizzle(getClient(), { schema });
	}
	return db;
}

/**
 * Executes a database operation with automatic retry on transient connection errors.
 * postgres.js handles reconnection internally, so this is a thin safety net
 * for edge cases where the first attempt hits a closing connection.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (isTransientDbError(error)) {
			return await fn();
		}
		throw error;
	}
}

export async function runMigrations(): Promise<void> {
	const database = getDB();
	const migrationsPath = join(process.cwd(), 'drizzle');
	console.log(`Running database migrations from ${migrationsPath}...`);
	try {
		await migrate(database, { migrationsFolder: migrationsPath });
		console.log('Migrations completed successfully');
	} catch (error) {
		console.error('Migration failed:', error);
		throw error;
	}
}

// Re-export schema for convenience
export * from './schema';
