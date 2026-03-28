import { describe, it, expect } from 'vitest';
import { RDA_VALUES } from '../rda';
import { ALL_NUTRIENTS } from '$lib/nutrients';

describe('RDA_VALUES', () => {
	it('has entries for key micronutrients', () => {
		const keys = RDA_VALUES.map((r) => r.nutrientKey);
		expect(keys).toContain('vitaminD');
		expect(keys).toContain('iron');
		expect(keys).toContain('calcium');
		expect(keys).toContain('magnesium');
	});

	it('has entries for vitamins', () => {
		const keys = RDA_VALUES.map((r) => r.nutrientKey);
		expect(keys).toContain('vitaminA');
		expect(keys).toContain('vitaminC');
		expect(keys).toContain('vitaminE');
		expect(keys).toContain('vitaminK');
		expect(keys).toContain('vitaminB1');
		expect(keys).toContain('vitaminB12');
	});

	it('has entries for minerals', () => {
		const keys = RDA_VALUES.map((r) => r.nutrientKey);
		expect(keys).toContain('zinc');
		expect(keys).toContain('selenium');
		expect(keys).toContain('potassium');
		expect(keys).toContain('sodium');
	});

	it('all nutrient keys match valid nutrients or core nutrients', () => {
		const validKeys = new Set([...ALL_NUTRIENTS.map((n) => n.key), 'fiber', 'sodium']);
		for (const rda of RDA_VALUES) {
			expect(validKeys.has(rda.nutrientKey), `Unknown nutrient key: ${rda.nutrientKey}`).toBe(true);
		}
	});

	it('all RDA male values are positive', () => {
		for (const rda of RDA_VALUES) {
			expect(rda.rdaMale, `rdaMale should be positive for ${rda.nutrientKey}`).toBeGreaterThan(0);
		}
	});

	it('all RDA female values are positive', () => {
		for (const rda of RDA_VALUES) {
			expect(rda.rdaFemale, `rdaFemale should be positive for ${rda.nutrientKey}`).toBeGreaterThan(
				0
			);
		}
	});

	it('has no duplicate nutrient keys', () => {
		const keys = RDA_VALUES.map((r) => r.nutrientKey);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('all entries have a non-empty label', () => {
		for (const rda of RDA_VALUES) {
			expect(rda.label, `label should be non-empty for ${rda.nutrientKey}`).toBeTruthy();
			expect(rda.label.length).toBeGreaterThan(0);
		}
	});

	it('all entries have a non-empty unit', () => {
		for (const rda of RDA_VALUES) {
			expect(rda.unit, `unit should be non-empty for ${rda.nutrientKey}`).toBeTruthy();
			expect(rda.unit.length).toBeGreaterThan(0);
		}
	});

	it('fiber is included', () => {
		const fiber = RDA_VALUES.find((r) => r.nutrientKey === 'fiber');
		expect(fiber).toBeDefined();
		expect(fiber!.rdaMale).toBeGreaterThan(0);
		expect(fiber!.rdaFemale).toBeGreaterThan(0);
	});

	it('has at least 20 nutrient entries', () => {
		expect(RDA_VALUES.length).toBeGreaterThanOrEqual(20);
	});
});
