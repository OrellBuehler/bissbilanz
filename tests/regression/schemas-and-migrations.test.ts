import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '$lib/server/mcp/server';
import { isDuplicateBarcodeError } from '$lib/server/foods';
import { entriesListResponseSchema } from '$lib/server/validation/responses/entries';
import { favoritesResponseSchema } from '$lib/server/validation/responses/favorites';
import { validationErrorResponseSchema } from '$lib/server/validation/responses/shared';
import { servingUnitValues, unitConversionFactor } from '$lib/units';

describe('411bc3ae drizzle journal timestamps stay strictly increasing', () => {
	const journal = JSON.parse(readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8')) as {
		entries: { idx: number; when: number; tag: string }[];
	};

	test('each migration is newer than the previous one (the migrator skips older ones)', () => {
		for (let i = 1; i < journal.entries.length; i++) {
			const prev = journal.entries[i - 1];
			const cur = journal.entries[i];
			expect(cur.when, `${cur.tag} must be newer than ${prev.tag}`).toBeGreaterThan(prev.when);
		}
	});

	test('idx is contiguous and every journal tag has its SQL file', () => {
		journal.entries.forEach((entry, i) => {
			expect(entry.idx).toBe(i);
			expect(existsSync(resolve('drizzle', `${entry.tag}.sql`)), entry.tag).toBe(true);
		});
	});
});

describe('92b6ef44 entry servingUnit is documented as the serving unit enum', () => {
	const entry = {
		id: '10000000-0000-4000-8000-000000000030',
		date: '2026-02-10',
		mealType: 'Lunch',
		servings: 1,
		notes: null,
		foodId: null,
		recipeId: null,
		supplementId: null,
		eatenAt: '2026-02-10T12:00:00.000Z',
		imageUrl: null,
		quickName: null,
		quickCalories: null,
		quickProtein: null,
		quickCarbs: null,
		quickFat: null,
		quickFiber: null,
		quickNutrients: null,
		foodName: null,
		calories: 1,
		protein: 1,
		carbs: 1,
		fat: 1,
		fiber: 1,
		servingSize: 100
	};

	test('a known unit parses', () => {
		const result = entriesListResponseSchema.safeParse({
			entries: [{ ...entry, servingUnit: 'ml' }],
			total: 1
		});
		expect(result.error?.issues).toBeUndefined();
	});

	test('an arbitrary string no longer parses as a serving unit', () => {
		const result = entriesListResponseSchema.safeParse({
			entries: [{ ...entry, servingUnit: 'bucket' }],
			total: 1
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['entries.0.servingUnit']);
	});
});

describe('1fd5d280 favorite recipes carry isFavorite', () => {
	const recipe = {
		id: '10000000-0000-4000-8000-000000000020',
		name: 'Porridge',
		imageUrl: null,
		calories: 1,
		protein: 1,
		carbs: 1,
		fat: 1,
		fiber: 1,
		logCount: 0,
		totalServings: 2,
		type: 'recipe'
	};

	test('the response schema requires isFavorite (iOS decodes it as non-optional)', () => {
		expect(favoritesResponseSchema.safeParse({ recipes: [recipe] }).success).toBe(false);
		expect(
			favoritesResponseSchema.safeParse({ recipes: [{ ...recipe, isFavorite: true }] }).success
		).toBe(true);
	});
});

describe('4d0bdb50 ValidationErrorResponse.details stays the documented flat record', () => {
	test('flat field -> messages maps are accepted', () => {
		const result = validationErrorResponseSchema.safeParse({
			error: 'Validation failed',
			details: { calories: ['Expected number'] }
		});
		expect(result.success).toBe(true);
	});

	test('the published spec still types details as an object of string arrays', () => {
		const spec = JSON.parse(readFileSync(resolve('docs/openapi.json'), 'utf8'));
		const details = spec.components.schemas.ValidationErrorResponse.properties.details;
		expect(details.type).toBe('object');
		expect(details.additionalProperties).toMatchObject({
			type: 'array',
			items: { type: 'string' }
		});
	});
});

describe('310ed41b cl is a supported serving unit', () => {
	test('cl is in the enum and converts to ml at 10x', () => {
		expect(servingUnitValues).toContain('cl');
		expect(unitConversionFactor('cl', 'ml')).toBe(10);
		expect(unitConversionFactor('l', 'cl')).toBe(100);
	});

	test('the published spec lists cl on the shared ServingUnit enum', () => {
		const spec = JSON.parse(readFileSync(resolve('docs/openapi.json'), 'utf8'));
		expect(spec.components.schemas.ServingUnit.enum).toContain('cl');
	});
});

describe('81e55e6e / f5ae76c4 duplicate barcode detection', () => {
	test('recognises the Postgres unique-constraint message for a barcode', () => {
		expect(
			isDuplicateBarcodeError(
				new Error(
					'duplicate key value violates unique constraint "foods_user_barcode_unique" barcode'
				)
			)
		).toBe(true);
	});

	test('does not fire for other unique constraints or non-errors', () => {
		expect(isDuplicateBarcodeError(new Error('violates unique constraint "foods_pkey" (id)'))).toBe(
			false
		);
		expect(isDuplicateBarcodeError(new Error('barcode is too short'))).toBe(false);
		expect(isDuplicateBarcodeError('unique constraint barcode')).toBe(false);
		expect(isDuplicateBarcodeError(null)).toBe(false);
	});
});

describe('2d500f8d MCP recipe tools describe whole-recipe totals', () => {
	test('list_recipes and get_recipe no longer claim per-serving macros', async () => {
		const server = createMcpServer('regression-test');
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		const client = new Client({ name: 'regression-test', version: '0.0.0' });
		await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
		const { tools } = await client.listTools();
		await client.close();

		for (const name of ['list_recipes', 'get_recipe']) {
			const description = tools.find((t) => t.name === name)?.description ?? '';
			expect(description, name).toContain('whole-recipe');
			expect(description, name).toContain('totalServings');
			expect(description, name).not.toMatch(/macros per serving/i);
		}
	});
});
