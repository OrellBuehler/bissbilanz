import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { SQL } from 'bun';
import { join } from 'node:path';
import { config } from './env';
import { isTransientDbError } from './db-retry';
import * as schema from './schema';

export { isTransientDbError } from './db-retry';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let db: Database | null = null;

export function getDB(): Database {
	if (!db) {
		const client = new SQL({
			url: config.database.url,
			max: config.database.poolMax,
			idleTimeout: config.database.idleTimeoutSeconds,
			maxLifetime: config.database.maxLifetimeSeconds,
			connectionTimeout: config.database.connectTimeoutSeconds
		});
		db = drizzle({ client, schema });
	}
	return db;
}

/**
 * Resets the connection pool so the next getDB() call creates fresh connections.
 * Closes the old pool's TCP connections to avoid leaking file descriptors.
 */
export function resetPool(): void {
	const old = db;
	db = null;
	if (old) {
		// $client is the underlying Bun SQL instance; close with a short grace period
		old.$client.close({ timeout: 1 }).catch(() => {});
	}
}

/**
 * Executes a database operation with automatic retry on transient connection errors.
 * On failure, resets the pool and retries once with a fresh connection.
 *
 * Only use for idempotent operations (reads, or writes guarded by unique constraints).
 * A retry may re-execute `fn` after the first call partially succeeded on the server.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (isTransientDbError(error)) {
			resetPool();
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
