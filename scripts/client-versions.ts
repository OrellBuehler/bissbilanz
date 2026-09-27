import { drizzle } from 'drizzle-orm/postgres-js';
import { asc, desc } from 'drizzle-orm';
import postgres from 'postgres';
import { clientVersions } from '../src/lib/server/schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL environment variable is required');
	process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

try {
	const rows = await db
		.select()
		.from(clientVersions)
		.orderBy(asc(clientVersions.platform), desc(clientVersions.lastSeenAt));
	console.table(
		rows.map((row) => ({
			platform: row.platform,
			version: row.version,
			firstSeen: row.firstSeenAt.toISOString().slice(0, 10),
			lastSeen: row.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')
		}))
	);
} finally {
	await client.end();
}
