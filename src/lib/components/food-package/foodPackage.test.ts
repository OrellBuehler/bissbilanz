import { describe, expect, it } from 'vitest';
import {
	applyToAll,
	buildMappings,
	buildResolutions,
	clearMapping,
	commonAction,
	filenameFromContentDisposition,
	foodsToCreate,
	groupNewFoods,
	initialResolutions,
	mappingCandidates,
	setMapping,
	setResolution,
	suggestedQuery,
	type MappedFood,
	type NewFoodItem,
	type ResolvableConflict
} from './foodPackage';

const conflict = (
	ref: string,
	existingId: string,
	allowed: ResolvableConflict['allowed'] = ['skip', 'replace', 'keep_both']
): ResolvableConflict => ({ ref, allowed, existing: { id: existingId } });

describe('food package resolutions', () => {
	const conflicts = [
		conflict('f1', 'a'),
		conflict('f2', 'a'),
		conflict('f3', 'b', ['skip', 'keep_both'])
	];

	it('defaults every conflict to skip', () => {
		expect(initialResolutions(conflicts)).toEqual({ f1: 'skip', f2: 'skip', f3: 'skip' });
	});

	it('allows only one replace per existing item', () => {
		let state = initialResolutions(conflicts);
		state = setResolution(state, conflicts, 'f1', 'replace');
		state = setResolution(state, conflicts, 'f2', 'replace');
		expect(state).toMatchObject({ f1: 'skip', f2: 'replace' });
	});

	it('ignores a disallowed action', () => {
		const state = initialResolutions(conflicts);
		expect(setResolution(state, conflicts, 'f3', 'replace')).toBe(state);
	});

	it('applies to all with fallbacks to skip', () => {
		expect(applyToAll(conflicts, 'replace')).toEqual({ f1: 'replace', f2: 'skip', f3: 'skip' });
		expect(applyToAll(conflicts, 'keep_both')).toEqual({
			f1: 'keep_both',
			f2: 'keep_both',
			f3: 'keep_both'
		});
	});

	it('reports the common action', () => {
		expect(commonAction(conflicts, applyToAll(conflicts, 'keep_both'))).toBe('keep_both');
		expect(commonAction(conflicts, applyToAll(conflicts, 'replace'))).toBeNull();
	});

	it('builds the commit payload with the shown existing ids', () => {
		const payload = buildResolutions(
			{
				packageHash: 'h',
				conflicts: {
					foods: [conflict('f1', 'a')] as never,
					recipes: [conflict('r1', 'x')] as never
				}
			},
			{ f1: 'replace' },
			{}
		);
		expect(payload).toEqual({
			packageHash: 'h',
			foods: [{ ref: 'f1', existingId: 'a', action: 'replace' }],
			recipes: [{ ref: 'r1', existingId: 'x', action: 'skip' }],
			mappings: []
		});
	});

	it('sends the chosen mappings with the commit payload', () => {
		const items = [item('f1'), item('f2')];
		const payload = buildResolutions(
			{ packageHash: 'h', conflicts: { foods: [], recipes: [] }, newFoods: { items } },
			{},
			{},
			setMapping({}, 'f2', own('own-1'))
		);
		expect(payload.mappings).toEqual([{ ref: 'f2', foodId: 'own-1' }]);
	});
});

const item = (ref: string, overrides: Partial<NewFoodItem> = {}): NewFoodItem => ({
	ref,
	role: 'ingredient',
	name: `Food ${ref}`,
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 100,
	recipes: [{ ref: 'r1', name: 'Bread' }],
	...overrides
});

const own = (id: string, overrides: Partial<MappedFood> = {}): MappedFood => ({
	id,
	name: `Own ${id}`,
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	...overrides
});

describe('food mappings', () => {
	it('sets and clears a mapping without touching the others', () => {
		let state = setMapping({}, 'f1', own('a'));
		state = setMapping(state, 'f2', own('b'));
		expect(Object.keys(state)).toEqual(['f1', 'f2']);
		state = clearMapping(state, 'f1');
		expect(Object.keys(state)).toEqual(['f2']);
		expect(clearMapping(state, 'f9')).toEqual(state);
	});

	it('builds mappings only for refs the preview offered, in preview order', () => {
		const state = { f2: own('b'), f1: own('a'), f9: own('c') };
		expect(buildMappings([item('f1'), item('f2'), item('f3')], state)).toEqual([
			{ ref: 'f1', foodId: 'a' },
			{ ref: 'f2', foodId: 'b' }
		]);
	});

	it('offers only foods of the same unit dimension, capped', () => {
		const foods = [
			own('g', { servingUnit: 'g' }),
			own('ml', { servingUnit: 'ml' }),
			own('kg', { servingUnit: 'kg' }),
			own('l', { servingUnit: 'l' })
		];
		expect(mappingCandidates(foods, item('f1', { servingUnit: 'g' }), 10).map((f) => f.id)).toEqual(
			['g', 'kg']
		);
		expect(
			mappingCandidates(foods, item('f1', { servingUnit: 'cup' }), 10).map((f) => f.id)
		).toEqual(['ml', 'l']);
		expect(mappingCandidates(foods, item('f1', { servingUnit: 'g' }), 1)).toHaveLength(1);
	});

	it('suggests the first meaningful word as a search term', () => {
		expect(suggestedQuery('Vollmilch 3.5%')).toBe('Vollmilch');
		expect(suggestedQuery('Le Gruyère AOP')).toBe('Gruyère');
		expect(suggestedQuery('Ei')).toBe('Ei');
	});

	it('groups shared foods before ingredient foods', () => {
		const groups = groupNewFoods([
			item('f1'),
			item('f2', { role: 'selected' }),
			item('f3', { role: 'ingredient' })
		]);
		expect(groups.selected.map((i) => i.ref)).toEqual(['f2']);
		expect(groups.ingredients.map((i) => i.ref)).toEqual(['f1', 'f3']);
	});

	it('counts what would still be created', () => {
		const items = [
			item('f1'),
			item('f2', { recipes: [{ ref: 'r2', name: 'Soup' }] }),
			item('f3', { role: 'selected', recipes: [] }),
			item('f4')
		];
		const created = (mappings = {}, recipes = {}) =>
			foodsToCreate(items, mappings, recipes).map((i) => i.ref);
		expect(created()).toEqual(['f1', 'f2', 'f3', 'f4']);
		expect(created({ f1: own('a'), f3: own('b') })).toEqual(['f2', 'f4']);
		// A recipe that is skipped brings none of its ingredient-only foods.
		expect(created({}, { r1: 'skip' })).toEqual(['f2', 'f3']);
		expect(created({}, { r1: 'keep_both' })).toEqual(['f1', 'f2', 'f3', 'f4']);
	});
});

describe('filenameFromContentDisposition', () => {
	it('prefers the UTF-8 name', () => {
		expect(
			filenameFromContentDisposition(
				`attachment; filename="Kaesespaetzle.bissbilanz"; filename*=UTF-8''K%C3%A4sesp%C3%A4tzle.bissbilanz`
			)
		).toBe('Käsespätzle.bissbilanz');
	});

	it('falls back to the plain name', () => {
		expect(filenameFromContentDisposition('attachment; filename="Lasagne.bissbilanz"')).toBe(
			'Lasagne.bissbilanz'
		);
		expect(filenameFromContentDisposition('attachment; filename=Lasagne.bissbilanz')).toBe(
			'Lasagne.bissbilanz'
		);
	});

	it('uses the plain name when the UTF-8 one is broken', () => {
		expect(
			filenameFromContentDisposition(
				`attachment; filename="A.bissbilanz"; filename*=UTF-8''%E0%A4%A`
			)
		).toBe('A.bissbilanz');
	});

	it('falls back to the generic name', () => {
		expect(filenameFromContentDisposition(null)).toBe('bissbilanz-foods.bissbilanz');
		expect(filenameFromContentDisposition('attachment')).toBe('bissbilanz-foods.bissbilanz');
		expect(filenameFromContentDisposition('attachment', 'x.bissbilanz')).toBe('x.bissbilanz');
	});

	it('never lets a path through', () => {
		expect(
			filenameFromContentDisposition(`attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd`)
		).toBe('_.._etc_passwd');
	});
});
