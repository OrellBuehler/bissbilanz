import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { join } from 'node:path';
import { config } from './env';
import * as schema from './schema';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let db: Database | null = null;

export function getDB(): Database {
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
