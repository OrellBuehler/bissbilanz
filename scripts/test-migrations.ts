#!/usr/bin/env bun
import { $ } from 'bun';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { mkdtemp, writeFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedData, U1, U2, F1, F2, SUP1, SUP2 } from './seed-migration-test';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('ERROR: DATABASE_URL is required');
	process.exit(1);
}

let BASE_SHA = process.env.BASE_SHA?.trim();
if (!BASE_SHA) {
	try {
		BASE_SHA = (await $`git rev-parse origin/main`.quiet().text()).trim();
		console.log(`BASE_SHA not set, using origin/main: ${BASE_SHA}`);
	} catch {
		console.error('ERROR: BASE_SHA is not set and origin/main is not available');
		process.exit(1);
	}
}

// Phase 1: Detect new migrations
console.log(`\nDetecting new migrations since ${BASE_SHA}...`);

const diffOutput = await $`git diff --name-only --diff-filter=A ${BASE_SHA} HEAD -- drizzle/`
	.quiet()
	.nothrow()
	.text();

const newMigrationFiles = diffOutput
	.trim()
	.split('\n')
	.filter((f) => f.endsWith('.sql') && f.startsWith('drizzle/'));

if (newMigrationFiles.length === 0) {
	console.log('No new migration files detected — nothing to test.');
	process.exit(0);
}

console.log(`New migrations: ${newMigrationFiles.join(', ')}`);

const modifiedOutput = await $`git diff --name-only --diff-filter=M ${BASE_SHA} HEAD -- drizzle/`
	.quiet()
	.nothrow()
	.text();

const modifiedMigrations = modifiedOutput
	.trim()
	.split('\n')
	.filter((f) => f.endsWith('.sql') && f.startsWith('drizzle/'));

if (modifiedMigrations.length > 0) {
	console.error(
		`ERROR: existing migrations were modified in this PR: ${modifiedMigrations.join(', ')}`
	);
	process.exit(1);
}

// Phase 2: Build temp "base" migrations folder
const newTags = newMigrationFiles.map((f) => f.split('/').pop()!.replace('.sql', ''));
const journalText = await Bun.file('drizzle/meta/_journal.json').text();
const journal = JSON.parse(journalText);
const baseEntries: Array<{ tag: string }> = journal.entries.filter(
	(e: { tag: string }) => !newTags.includes(e.tag)
);

console.log(`\nBase migrations: ${baseEntries.length}, new migrations: ${newTags.length}`);

const client = postgres(DATABASE_URL);
const db = drizzle(client);
let tempDir: string | null = null;

try {
	if (baseEntries.length === 0) {
		console.log('All migrations are new — applying directly on empty DB...');
		await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
		console.log('\nAll migrations applied on empty DB.');
	} else {
		tempDir = await mkdtemp(join(tmpdir(), 'migration-test-'));
		const tempMeta = join(tempDir, 'meta');
		await mkdir(tempMeta, { recursive: true });

		const baseJournal = { ...journal, entries: baseEntries };
		await writeFile(join(tempMeta, '_journal.json'), JSON.stringify(baseJournal, null, 2));

		for (const entry of baseEntries) {
			await copyFile(`drizzle/${entry.tag}.sql`, join(tempDir, `${entry.tag}.sql`));
			try {
				await copyFile(
					`drizzle/meta/${entry.tag}_snapshot.json`,
					join(tempMeta, `${entry.tag}_snapshot.json`)
				);
			} catch {
				// snapshot files are optional for the runtime migrator
			}
		}

		console.log(`Temp base folder: ${tempDir}`);

		// Apply base migrations
		console.log('\nApplying base migrations...');
		await migrate(db, { migrationsFolder: tempDir });
		console.log('Base migrations applied.');

		// Seed data
		console.log('\nSeeding data...');
		await seedData(client);

		// Apply new migrations (Drizzle skips already-applied ones via __drizzle_migrations)
		console.log('\nApplying new migrations against seeded data...');
		await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
		console.log('New migrations applied.');
	}

	// Phase 4: Validate seeded data survived
	if (baseEntries.length > 0) {
		console.log('\nValidating seeded data survived migration...');
		const [{ count: userCount }] =
			await client`SELECT count(*)::int AS count FROM users WHERE id IN (${U1}, ${U2})`;
		if (userCount !== 2) {
			console.error(`FAIL: expected 2 seeded users after migration, found ${userCount}`);
			process.exit(1);
		}
		console.log(`users: ${userCount} rows`);

		const [{ count: foodCount }] =
			await client`SELECT count(*)::int AS count FROM foods WHERE id IN (${F1}, ${F2})`;
		if (foodCount !== 2) {
			console.error(`FAIL: expected 2 seeded foods after migration, found ${foodCount}`);
			process.exit(1);
		}
		console.log(`foods: ${foodCount} rows`);

		// Original food entry; migration 0035 adds entries per ingredient for each
		// seeded supplement_log, so filter by supplement_id to scope the check to
		// the originally-seeded row.
		const [{ count: entryCount }] =
			await client`SELECT count(*)::int AS count FROM food_entries WHERE user_id = ${U1} AND supplement_id IS NULL`;
		if (entryCount !== 1) {
			console.error(`FAIL: expected 1 seeded food_entry after migration, found ${entryCount}`);
			process.exit(1);
		}
		console.log(`food_entries: ${entryCount} rows`);

		// SUP1: no ingredients pre-migration → migration synthesizes 1 ingredient,
		// so its supplement_log converts to exactly 1 food_entry.
		const [{ count: sup1EntryCount }] =
			await client`SELECT count(*)::int AS count FROM food_entries WHERE user_id = ${U1} AND supplement_id = ${SUP1}`;
		if (sup1EntryCount !== 1) {
			console.error(`FAIL: expected 1 food_entry migrated from SUP1 log, found ${sup1EntryCount}`);
			process.exit(1);
		}
		console.log(`SUP1 (synthetic-ingredient path) → food_entries: ${sup1EntryCount} rows`);

		// SUP2: already has 2 ingredients pre-migration → each supplement_log
		// becomes one food_entry per ingredient, so the single SUP2 log → 2 rows.
		const [{ count: sup2EntryCount }] =
			await client`SELECT count(*)::int AS count FROM food_entries WHERE user_id = ${U1} AND supplement_id = ${SUP2}`;
		if (sup2EntryCount !== 2) {
			console.error(
				`FAIL: expected 2 food_entries migrated from SUP2 log (one per ingredient), found ${sup2EntryCount}`
			);
			process.exit(1);
		}
		console.log(`SUP2 (existing-ingredient path) → food_entries: ${sup2EntryCount} rows`);

		// Each supplement_ingredient should now reference a backing food with
		// kind='supplement'. Our seed creates SUP1 (no ingredients → 1 synthetic
		// backing food) and SUP2 (2 ingredients → 2 backing foods) = 3 total.
		const [{ count: backingFoodCount }] =
			await client`SELECT count(*)::int AS count FROM foods WHERE user_id = ${U1} AND kind = 'supplement'`;
		if (backingFoodCount !== 3) {
			console.error(
				`FAIL: expected 3 supplement backing foods after migration, found ${backingFoodCount}`
			);
			process.exit(1);
		}
		console.log(`supplement backing foods: ${backingFoodCount} rows`);

		const [{ count: recipeCount }] =
			await client`SELECT count(*)::int AS count FROM recipes WHERE user_id = ${U1}`;
		if (recipeCount !== 1) {
			console.error(`FAIL: expected 1 seeded recipe after migration, found ${recipeCount}`);
			process.exit(1);
		}
		console.log(`recipes: ${recipeCount} rows`);

		const [{ count: supplementCount }] =
			await client`SELECT count(*)::int AS count FROM supplements WHERE user_id = ${U1}`;
		if (supplementCount !== 2) {
			console.error(
				`FAIL: expected 2 seeded supplements after migration, found ${supplementCount}`
			);
			process.exit(1);
		}
		console.log(`supplements: ${supplementCount} rows`);

		const [{ count: weightCount }] =
			await client`SELECT count(*)::int AS count FROM weight_entries WHERE user_id = ${U1}`;
		if (weightCount !== 1) {
			console.error(`FAIL: expected 1 seeded weight_entry after migration, found ${weightCount}`);
			process.exit(1);
		}
		console.log(`weight_entries: ${weightCount} rows`);
	}

	console.log('\nMigration test PASSED.');
} finally {
	await client.end();
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
}
