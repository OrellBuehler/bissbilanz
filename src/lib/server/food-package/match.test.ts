import { describe, expect, it } from 'vitest';
import { ApiError } from '$lib/server/errors';
import type {
	FoodPackageManifest,
	PackageFood,
	PackageRecipe
} from '$lib/server/validation/food-package';
import {
	matchPackage,
	resolveOperations,
	type ExistingFood,
	type ExistingRecipe,
	type MatchResult
} from './match';

const food = (ref: string, overrides: Partial<PackageFood> = {}): PackageFood => ({
	ref,
	role: 'selected',
	name: `Food ${ref}`,
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 100,
	protein: 1,
	carbs: 2,
	fat: 3,
	fiber: 4,
	barcode: null,
	labels: [],
	...overrides
});

const recipe = (ref: string, overrides: Partial<PackageRecipe> = {}): PackageRecipe => ({
	ref,
	name: `Recipe ${ref}`,
	totalServings: 2,
	ingredients: [],
	...overrides
});

const manifest = (foods: PackageFood[], recipes: PackageRecipe[] = []): FoodPackageManifest => ({
	format: 'bissbilanz.food-package',
	formatVersion: 1,
	exportedAt: null,
	foods,
	recipes
});

let idCounter = 0;
const existing = (overrides: Partial<ExistingFood> = {}): ExistingFood => ({
	id: `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`,
	name: 'Existing',
	brand: null,
	barcode: null,
	servingUnit: 'g',
	kind: 'food',
	updatedAt: new Date('2026-01-01'),
	entryCount: 0,
	recipeCount: 0,
	...overrides
});

const existingRecipe = (overrides: Partial<ExistingRecipe> = {}): ExistingRecipe => ({
	id: `10000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`,
	name: 'Existing recipe',
	updatedAt: new Date('2026-01-01'),
	entryCount: 0,
	...overrides
});

/** Resolve every conflict with the same action. */
const resolveAll = (match: MatchResult, action: 'skip' | 'replace' | 'keep_both') => ({
	foods: match.foodConflicts.map((c) => ({ ref: c.ref, action, existingId: c.existingId })),
	recipes: match.recipeConflicts.map((c) => ({ ref: c.ref, action, existingId: c.existingId }))
});

describe('matchPackage', () => {
	it('treats unmatched foods as new', () => {
		const result = matchPackage(manifest([food('f1')]), [existing({ name: 'Other' })], []);
		expect(result.newFoodRefs).toEqual(['f1']);
		expect(result.foodConflicts).toEqual([]);
	});

	it('matches name + brand ignoring case, accents and whitespace', () => {
		const target = existing({ name: 'Müsli  Crunchy', brand: 'Migros' });
		const result = matchPackage(
			manifest([food('f1', { name: 'musli crunchy', brand: ' MIGROS ' })]),
			[target],
			[]
		);
		expect(result.foodConflicts).toMatchObject([
			{ ref: 'f1', reason: 'name', existingId: target.id }
		]);
	});

	it('does not match the same name with a different brand', () => {
		const result = matchPackage(
			manifest([food('f1', { name: 'Milk', brand: 'Coop' })]),
			[existing({ name: 'Milk', brand: 'Migros' })],
			[]
		);
		expect(result.newFoodRefs).toEqual(['f1']);
	});

	it('prefers the barcode match when name and barcode hit different foods', () => {
		const byName = existing({ name: 'Oats' });
		const byBarcode = existing({ name: 'Haferflocken', barcode: '7610000000001' });
		const result = matchPackage(
			manifest([food('f1', { name: 'Oats', barcode: '7610000000001' })]),
			[byName, byBarcode],
			[]
		);
		expect(result.foodConflicts[0]).toMatchObject({
			reason: 'barcode',
			existingId: byBarcode.id,
			alsoMatches: [byName.id]
		});
		expect(result.foodConflicts[0].notes).toContain('barcode_dropped_on_keep_both');
	});

	it('reports barcode_and_name when both hit the same food', () => {
		const target = existing({ name: 'Oats', barcode: '123' });
		const result = matchPackage(
			manifest([food('f1', { name: 'Oats', barcode: '123' })]),
			[target],
			[]
		);
		expect(result.foodConflicts[0].reason).toBe('barcode_and_name');
	});

	it('picks the most recently updated food among several name matches', () => {
		const older = existing({ name: 'Oats', updatedAt: new Date('2025-01-01') });
		const newer = existing({ name: 'Oats', updatedAt: new Date('2026-06-01') });
		const result = matchPackage(manifest([food('f1', { name: 'Oats' })]), [older, newer], []);
		expect(result.foodConflicts[0].existingId).toBe(newer.id);
		expect(result.foodConflicts[0].alsoMatches).toEqual([older.id]);
	});

	it('drops a barcode that appears twice in the package', () => {
		const result = matchPackage(
			manifest([food('f1', { barcode: '42' }), food('f2', { barcode: ' 42 ' })]),
			[],
			[]
		);
		expect(result.barcodes.get('f1')).toBe('42');
		expect(result.barcodes.get('f2')).toBeNull();
		expect(result.issues).toHaveLength(1);
	});

	it('never conflicts with a supplement but still drops its barcode', () => {
		const supplement = existing({ name: 'Vitamin D', kind: 'supplement', barcode: '99' });
		const result = matchPackage(
			manifest([food('f1', { name: 'Vitamin D', barcode: '99' })]),
			[supplement],
			[]
		);
		expect(result.newFoodRefs).toEqual(['f1']);
		expect(result.barcodes.get('f1')).toBeNull();
	});

	it('blocks replace when a unit change would break the user recipes', () => {
		const target = existing({ name: 'Milk', servingUnit: 'ml', recipeCount: 2 });
		const result = matchPackage(
			manifest([food('f1', { name: 'Milk', servingUnit: 'g' })]),
			[target],
			[]
		);
		expect(result.foodConflicts[0].allowed).toEqual(['skip', 'keep_both']);
		expect(result.foodConflicts[0].notes).toContain('replace_unit_blocked');
	});

	it('warns that replace changes history when the food is logged', () => {
		const target = existing({ name: 'Milk', entryCount: 5 });
		const result = matchPackage(manifest([food('f1', { name: 'Milk' })]), [target], []);
		expect(result.foodConflicts[0].allowed).toContain('replace');
		expect(result.foodConflicts[0].notes).toContain('replace_changes_history');
	});

	it('groups incoming foods that target the same existing food', () => {
		const target = existing({ name: 'Oats', barcode: '1' });
		const result = matchPackage(
			manifest([food('f1', { name: 'Oats' }), food('f2', { name: 'Other', barcode: '1' })]),
			[target],
			[]
		);
		expect(result.foodConflicts.map((c) => c.targetGroup)).toEqual([target.id, target.id]);
	});

	it('flags skip that would force a copy for an imported recipe', () => {
		const target = existing({ name: 'Milk', servingUnit: 'g' });
		const result = matchPackage(
			manifest(
				[food('f1', { name: 'Milk', servingUnit: 'ml' })],
				[recipe('r1', { ingredients: [{ food: 'f1', quantity: 200, servingUnit: 'ml' }] })]
			),
			[target],
			[]
		);
		expect(result.foodConflicts[0].notes).toContain('skip_may_copy_for_recipe');
	});

	it('rejects recipes with unknown ingredients or incompatible units', () => {
		const result = matchPackage(
			manifest(
				[food('f1', { servingUnit: 'g' })],
				[
					recipe('r1', { ingredients: [{ food: 'f9', quantity: 1, servingUnit: 'g' }] }),
					recipe('r2', { ingredients: [{ food: 'f1', quantity: 1, servingUnit: 'ml' }] }),
					recipe('r3', { ingredients: [{ food: 'f1', quantity: 1, servingUnit: 'kg' }] })
				]
			),
			[],
			[]
		);
		expect([...result.invalidRecipeRefs]).toEqual(['r1', 'r2']);
		expect(result.newRecipeRefs).toEqual(['r3']);
	});

	it('matches recipes by normalized name', () => {
		const target = existingRecipe({ name: 'Overnight Oats' });
		const result = matchPackage(
			manifest([], [recipe('r1', { name: 'overnight  oats' })]),
			[],
			[target]
		);
		expect(result.recipeConflicts).toMatchObject([{ ref: 'r1', existingId: target.id }]);
	});
});

describe('resolveOperations', () => {
	it('inserts new foods and applies each conflict action', () => {
		const a = existing({ name: 'A' });
		const b = existing({ name: 'B', barcode: '2' });
		const c = existing({ name: 'C' });
		const m = manifest([
			food('f1', { name: 'New' }),
			food('f2', { name: 'A' }),
			food('f3', { name: 'B', barcode: '2' }),
			food('f4', { name: 'C' })
		]);
		const existingFoods = [a, b, c];
		const match = matchPackage(m, existingFoods, []);
		const ops = resolveOperations(
			m,
			match,
			{
				foods: [
					{ ref: 'f2', action: 'skip', existingId: a.id },
					{ ref: 'f3', action: 'keep_both', existingId: b.id },
					{ ref: 'f4', action: 'replace', existingId: c.id }
				],
				recipes: []
			},
			existingFoods
		);
		expect(ops.foods.get('f1')).toMatchObject({ kind: 'insert', keptBoth: false });
		expect(ops.foods.get('f2')).toMatchObject({ kind: 'skip', id: a.id });
		// Keep both on a barcode clash stores the copy without the barcode.
		expect(ops.foods.get('f3')).toMatchObject({ kind: 'insert', keptBoth: true, barcode: null });
		expect(ops.foods.get('f4')).toMatchObject({ kind: 'replace', id: c.id });
	});

	it('throws stale_preview when a conflict has no resolution', () => {
		const m = manifest([food('f1', { name: 'A' })]);
		const a = existing({ name: 'A' });
		const match = matchPackage(m, [a], []);
		expect(() => resolveOperations(m, match, { foods: [], recipes: [] }, [a])).toThrowError(
			expect.objectContaining({ status: 409, message: 'stale_preview' }) as ApiError
		);
	});

	it('throws stale_preview when the target changed', () => {
		const m = manifest([food('f1', { name: 'A' })]);
		const a = existing({ name: 'A' });
		const match = matchPackage(m, [a], []);
		expect(() =>
			resolveOperations(
				m,
				match,
				{
					foods: [{ ref: 'f1', action: 'skip', existingId: existing().id }],
					recipes: []
				},
				[a]
			)
		).toThrowError(expect.objectContaining({ status: 409 }) as ApiError);
	});

	it('rejects a disallowed action with 400', () => {
		const m = manifest([food('f1', { name: 'Milk', servingUnit: 'g' })]);
		const target = existing({ name: 'Milk', servingUnit: 'ml', recipeCount: 1 });
		const match = matchPackage(m, [target], []);
		expect(() => resolveOperations(m, match, resolveAll(match, 'replace'), [target])).toThrowError(
			expect.objectContaining({ status: 400 }) as ApiError
		);
	});

	it('lets only one food replace a shared target; the rest are skipped', () => {
		const target = existing({ name: 'Oats', barcode: '1' });
		const m = manifest([food('f1', { name: 'Oats' }), food('f2', { name: 'X', barcode: '1' })]);
		const match = matchPackage(m, [target], []);
		const ops = resolveOperations(m, match, resolveAll(match, 'replace'), [target]);
		expect(ops.foods.get('f1')).toMatchObject({ kind: 'replace' });
		expect(ops.foods.get('f2')).toMatchObject({ kind: 'skip', id: target.id });
		expect(ops.issues).toHaveLength(1);
	});

	it('imports a copy when a skipped food cannot express a recipe quantity', () => {
		const target = existing({ name: 'Milk', servingUnit: 'g' });
		const m = manifest(
			[food('f1', { name: 'Milk', servingUnit: 'ml' })],
			[recipe('r1', { ingredients: [{ food: 'f1', quantity: 200, servingUnit: 'ml' }] })]
		);
		const match = matchPackage(m, [target], []);
		const ops = resolveOperations(m, match, resolveAll(match, 'skip'), [target]);
		expect(ops.foods.get('f1')).toMatchObject({ kind: 'insert', keptBoth: true });
	});

	it('keeps the skip when the units are compatible', () => {
		const target = existing({ name: 'Milk', servingUnit: 'ml' });
		const m = manifest(
			[food('f1', { name: 'Milk', servingUnit: 'l' })],
			[recipe('r1', { ingredients: [{ food: 'f1', quantity: 200, servingUnit: 'ml' }] })]
		);
		const match = matchPackage(m, [target], []);
		const ops = resolveOperations(m, match, resolveAll(match, 'skip'), [target]);
		expect(ops.foods.get('f1')).toMatchObject({ kind: 'skip', id: target.id });
	});

	it('prunes ingredient-only foods whose recipes are not imported', () => {
		const target = existingRecipe({ name: 'Porridge' });
		const m = manifest(
			[food('f1', { role: 'ingredient' }), food('f2', { role: 'ingredient' })],
			[
				recipe('r1', {
					name: 'Porridge',
					ingredients: [{ food: 'f1', quantity: 50, servingUnit: 'g' }]
				}),
				recipe('r2', { ingredients: [{ food: 'f2', quantity: 50, servingUnit: 'g' }] })
			]
		);
		const match = matchPackage(m, [], [target]);
		const ops = resolveOperations(m, match, resolveAll(match, 'skip'), []);
		expect(ops.foods.has('f1')).toBe(false);
		expect(ops.foods.get('f2')).toMatchObject({ kind: 'insert' });
		expect(ops.pruned).toBe(1);
		expect(ops.recipes.get('r1')).toMatchObject({ kind: 'skip' });
		expect(ops.recipes.get('r2')).toMatchObject({ kind: 'insert' });
	});
});
