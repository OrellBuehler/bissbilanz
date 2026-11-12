import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../helpers/mock-db';

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const { countEnrichmentCandidates, enrichmentCandidate, nextEnrichmentCandidates } =
	await import('$lib/server/food-enrichment/candidates');

const render = (value: SQL) => new PgDialect().sqlToQuery(value);

beforeEach(() => reset());

describe('enrichmentCandidate', () => {
	test('is one predicate over barcode, missing quality data and the 30-day marker', () => {
		const { sql, params } = render(enrichmentCandidate('user-1'));
		expect(sql).toBe(
			'("foods"."user_id" = $1 and "foods"."kind" = $2 and "foods"."barcode" ~ \'\\S\'' +
				' and ("foods"."nutri_score" is null or "foods"."nova_group" is null' +
				' or coalesce("foods"."ingredients_text", \'\') !~ \'\\S\')' +
				' and ("foods"."off_checked_at" is null' +
				' or "foods"."off_checked_at" < now() - interval \'30 days\'))'
		);
		expect(params).toEqual(['user-1', 'food']);
	});
});

describe('countEnrichmentCandidates', () => {
	test('counts with the shared predicate', async () => {
		queueResults([[{ total: 7 }]]);
		expect(await countEnrichmentCandidates('user-1')).toBe(7);
		const where = getCalls().find((call) => call.method === 'where');
		expect(render(where!.args[0]).sql).toBe(render(enrichmentCandidate('user-1')).sql);
	});

	test('is zero without rows', async () => {
		queueResults([[]]);
		expect(await countEnrichmentCandidates('user-1')).toBe(0);
	});
});

describe('nextEnrichmentCandidates', () => {
	test('pages by id after the cursor', async () => {
		queueResults([[{ id: 'b', barcode: '4000000000000' }]]);
		expect(await nextEnrichmentCandidates('user-1', 'a', 25)).toEqual([
			{ id: 'b', barcode: '4000000000000' }
		]);
		const where = render(getCalls().find((call) => call.method === 'where')!.args[0]);
		expect(where.sql).toContain('"foods"."id" > $3');
		expect(where.params).toEqual(['user-1', 'food', 'a']);
		expect(getCalls().find((call) => call.method === 'limit')!.args).toEqual([25]);
	});

	test('starts from the beginning without a cursor', async () => {
		queueResults([[{ id: 'a', barcode: null }]]);
		expect(await nextEnrichmentCandidates('user-1', null, 25)).toEqual([{ id: 'a', barcode: '' }]);
		const where = render(getCalls().find((call) => call.method === 'where')!.args[0]);
		expect(where.sql).not.toContain('"foods"."id" >');
	});
});
