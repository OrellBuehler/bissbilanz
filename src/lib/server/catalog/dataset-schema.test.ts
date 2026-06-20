import { describe, it, expect } from 'vitest';
import { datasetHeaderSchema, datasetProductSchema } from './dataset-schema';

describe('dataset-schema', () => {
	it('accepts a valid header record', () => {
		const r = datasetHeaderSchema.safeParse({
			_dataset: {
				key: 'migros',
				name: 'Migros (Switzerland)',
				source: 'migros',
				priority: 10,
				version: '2026.05.18',
				snapshotAt: '2026-05-18T00:00:00.000Z'
			}
		});
		expect(r.success).toBe(true);
	});

	it('accepts a minimal valid product line', () => {
		const r = datasetProductSchema.safeParse({
			name: 'Zweifel Paprika Chips',
			servingSize: 100,
			servingUnit: 'g',
			calories: 515,
			protein: 5.8,
			carbs: 53,
			fat: 30,
			fiber: 5.6
		});
		expect(r.success).toBe(true);
	});

	it('accepts known extended nutrients and OFF quality fields', () => {
		const r = datasetProductSchema.safeParse({
			name: 'X',
			servingSize: 100,
			servingUnit: 'g',
			calories: 1,
			protein: 1,
			carbs: 1,
			fat: 1,
			fiber: 1,
			saturatedFat: 5.1,
			salt: 1.3,
			barcode: '7610095131003',
			language: 'de',
			nutriScore: 'd',
			novaGroup: 4,
			additives: ['en:e330'],
			sourceUrl: 'https://www.migros.ch/de/product/123',
			sourceRef: '123'
		});
		expect(r.success).toBe(true);
	});

	it('rejects a product missing required core macros', () => {
		const r = datasetProductSchema.safeParse({ name: 'X', servingSize: 100, servingUnit: 'g' });
		expect(r.success).toBe(false);
	});

	it('rejects negative nutrients and bad nutriScore', () => {
		expect(
			datasetProductSchema.safeParse({
				name: 'X',
				servingSize: 100,
				servingUnit: 'g',
				calories: -1,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0
			}).success
		).toBe(false);
		expect(
			datasetProductSchema.safeParse({
				name: 'X',
				servingSize: 100,
				servingUnit: 'g',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0,
				nutriScore: 'z'
			}).success
		).toBe(false);
	});
});
