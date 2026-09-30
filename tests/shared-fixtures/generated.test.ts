import { describe, expect, it } from 'vitest';

import { casesFor, diff, expectedFor, loadFixture } from './helpers';
import { runGeneratedCase } from './runners';

/**
 * The generated grids (tests/fixtures/shared/generated-*.json, produced by
 * scripts/shared-fixtures/generate.ts from these same runners). Kotlin
 * (SharedGeneratedFixturesTest) and iOS (SharedFixtureTests) assert the same files.
 * Running them here too catches an implementation that changed without the fixtures
 * being regenerated, before `bun run shared:check` does.
 */
const files = [
	'generated-unit-conversion.json',
	'generated-recipe-math.json',
	'generated-goal-rules.json',
	'generated-meal-types.json'
];

for (const file of files) {
	describe(`generated shared fixtures: ${file}`, () => {
		const fixture = loadFixture(file);
		const cases = casesFor(fixture, 'web');

		it('has cases', () => expect(cases.length).toBeGreaterThan(0));

		it('matches the current implementation', () => {
			const failures = cases.flatMap((c) =>
				diff(
					runGeneratedCase(c.fn, c.input),
					expectedFor(c, 'web'),
					fixture.tolerance ?? 1e-9,
					`${c.fn}/${c.name}`
				)
			);
			expect(failures).toEqual([]);
		});
	});
}
