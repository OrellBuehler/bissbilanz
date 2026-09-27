import { describe, expect, it } from 'vitest';
import {
	applyToAll,
	buildResolutions,
	commonAction,
	initialResolutions,
	setResolution,
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
			recipes: [{ ref: 'r1', existingId: 'x', action: 'skip' }]
		});
	});
});
