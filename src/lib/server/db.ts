import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { SQL } from 'bun';
import { join } from 'node:path';
import { config } from './env';
import * as schema from './schema';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let db: Database | null = null;

export function getDB(): Database {
	if (!db) {
		const client = new SQL(config.database.url);
		db = drizzle({ client, schema });
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
