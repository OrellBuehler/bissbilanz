#!/usr/bin/env bun
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { catalogDatasets, catalogFoods, catalogAccess, users } from '../src/lib/server/schema';
import {
	datasetHeaderSchema,
	datasetProductSchema
} from '../src/lib/server/catalog/dataset-schema';
import { ALL_NUTRIENT_KEYS } from '../src/lib/nutrients';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL environment variable is required');
	process.exit(1);
}
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema: { catalogDatasets, catalogFoods, catalogAccess, users } });

const TRGM_INDEX = 'idx_catalog_foods_name_trgm';

function pickNutrientCols(p: Record<string, unknown>) {
	return Object.fromEntries(
		ALL_NUTRIENT_KEYS.map((k) => [k, (p[k] as number | null | undefined) ?? null])
	);
}

async function importDataset(file: string) {
	const text = await Bun.file(file).text();
	const lines = text.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length === 0) throw new Error('Empty dataset file');

	const header = datasetHeaderSchema.parse(JSON.parse(lines[0]))._dataset;

	const products = lines.slice(1).map((line, i) => {
		const parsed = datasetProductSchema.safeParse(JSON.parse(line));
		if (!parsed.success) {
			throw new Error(`Invalid product at line ${i + 2}: ${parsed.error.message}`);
		}
		return parsed.data;
	});

	await db.transaction(async (tx) => {
		const [ds] = await tx
			.insert(catalogDatasets)
			.values({
				key: header.key,
				name: header.name,
				source: header.source,
				priority: header.priority,
				version: header.version ?? null,
				snapshotAt: header.snapshotAt ? new Date(header.snapshotAt) : null,
				productCount: products.length,
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: catalogDatasets.key,
				set: {
					name: header.name,
					source: header.source,
					priority: header.priority,
					version: header.version ?? null,
					snapshotAt: header.snapshotAt ? new Date(header.snapshotAt) : null,
					productCount: products.length,
					updatedAt: new Date()
				}
			})
			.returning();

		await tx.execute(sql.raw(`DROP INDEX IF EXISTS "${TRGM_INDEX}"`));
		await tx.delete(catalogFoods).where(eq(catalogFoods.datasetId, ds.id));

		const CHUNK = 2000;
		for (let i = 0; i < products.length; i += CHUNK) {
			const slice = products.slice(i, i + CHUNK).map((p) => ({
				datasetId: ds.id,
				name: p.name,
				brand: p.brand ?? null,
				language: p.language ?? null,
				servingSize: p.servingSize,
				servingUnit: p.servingUnit,
				calories: p.calories,
				protein: p.protein,
				carbs: p.carbs,
				fat: p.fat,
				fiber: p.fiber,
				barcode: p.barcode ?? null,
				nutriScore: p.nutriScore ?? null,
				novaGroup: p.novaGroup ?? null,
				additives: p.additives ?? null,
				ingredientsText: p.ingredientsText ?? null,
				imageUrl: p.imageUrl ?? null,
				sourceUrl: p.sourceUrl ?? null,
				sourceRef: p.sourceRef ?? null,
				crawledAt: p.crawledAt ? new Date(p.crawledAt) : null,
				...pickNutrientCols(p as Record<string, unknown>)
			}));
			if (slice.length > 0) await tx.insert(catalogFoods).values(slice);
		}

		await tx.execute(
			sql.raw(`CREATE INDEX "${TRGM_INDEX}" ON "catalog_foods" USING gin ("name" gin_trgm_ops)`)
		);
	});

	console.log(`Imported ${products.length} products into dataset "${header.key}"`);
}

async function resolveUserId(email: string): Promise<string> {
	const u = await db.query.users.findFirst({ where: eq(users.email, email) });
	if (!u) throw new Error(`No user with email ${email}`);
	return u.id;
}

async function resolveDatasetId(key: string): Promise<string> {
	const d = await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, key) });
	if (!d) throw new Error(`No dataset with key ${key}`);
	return d.id;
}

async function grant(email: string, key: string) {
	const userId = await resolveUserId(email);
	const datasetId = await resolveDatasetId(key);
	await db.insert(catalogAccess).values({ userId, datasetId }).onConflictDoNothing();
	console.log(`Granted "${key}" to ${email}`);
}

async function revoke(email: string, key: string) {
	const userId = await resolveUserId(email);
	const datasetId = await resolveDatasetId(key);
	await db
		.delete(catalogAccess)
		.where(sql`${catalogAccess.userId} = ${userId} AND ${catalogAccess.datasetId} = ${datasetId}`);
	console.log(`Revoked "${key}" from ${email}`);
}

async function list() {
	const datasets = await db.select().from(catalogDatasets);
	for (const d of datasets) {
		const grants = await db
			.select({ email: users.email })
			.from(catalogAccess)
			.innerJoin(users, eq(users.id, catalogAccess.userId))
			.where(eq(catalogAccess.datasetId, d.id));
		console.log(
			`${d.key}  (${d.source}, prio ${d.priority}, ${d.productCount ?? 0} products)  -> ${
				grants.map((g) => g.email).join(', ') || '(no grants)'
			}`
		);
	}
}

const [cmd, ...args] = process.argv.slice(2);

try {
	if (cmd === 'import') {
		if (!args[0]) throw new Error('Usage: catalog import <file.jsonl>');
		await importDataset(args[0]);
	} else if (cmd === 'grant') {
		if (!args[0] || !args[1]) throw new Error('Usage: catalog grant <userEmail> <datasetKey>');
		await grant(args[0], args[1]);
	} else if (cmd === 'revoke') {
		if (!args[0] || !args[1]) throw new Error('Usage: catalog revoke <userEmail> <datasetKey>');
		await revoke(args[0], args[1]);
	} else if (cmd === 'list') {
		await list();
	} else {
		throw new Error(`Unknown command: ${cmd ?? '(none)'}. Expected: import|grant|revoke|list`);
	}
	await client.end();
	process.exit(0);
} catch (e) {
	console.error(e instanceof Error ? e.message : String(e));
	await client.end();
	process.exit(1);
}
