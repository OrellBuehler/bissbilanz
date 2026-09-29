/**
 * Builds `server-export.bissbilanz`, a food package laid out exactly like the one
 * `buildFoodPackage` (src/lib/server/food-package/export.ts) produces: README.txt, a tab-indented
 * `bissbilanz-foods.json` with every nutrient key present, and `images/<ref>.webp` stored
 * without compression. The Android and iOS importers read this file in their unit tests.
 *
 *   bun tests/fixtures/food-package/generate.ts
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { ALL_NUTRIENT_KEYS } from '../../../src/lib/nutrients';

const dir = dirname(fileURLToPath(import.meta.url));

const webp = (color: { r: number; g: number; b: number }) =>
	sharp({ create: { width: 8, height: 8, channels: 3, background: color } })
		.webp({ quality: 80 })
		.toBuffer();

const food = (
	ref: string,
	role: 'selected' | 'ingredient',
	fields: Record<string, unknown>,
	nutrients: Record<string, number> = {}
) => ({
	ref,
	role,
	brand: null,
	barcode: null,
	nutriScore: null,
	novaGroup: null,
	additives: null,
	ingredientsText: null,
	labels: [],
	image: null,
	imageUrl: null,
	...fields,
	...Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, nutrients[key] ?? null]))
});

const manifest = {
	format: 'bissbilanz.food-package',
	formatVersion: 1,
	exportedAt: '2026-09-28T10:00:00.000Z',
	foods: [
		food(
			'f1',
			'selected',
			{
				name: 'Bio Haferflocken',
				brand: 'Migros',
				servingSize: 40,
				servingUnit: 'g',
				calories: 152,
				protein: 5.4,
				carbs: 24.6,
				fat: 2.8,
				fiber: 4,
				barcode: '7610200000001',
				nutriScore: 'a',
				novaGroup: 1,
				additives: [],
				ingredientsText: 'Haferflocken',
				labels: ['oat', 'cereal'],
				image: 'images/f1.webp'
			},
			{ saturatedFat: 0.5, sugar: 0.4, sodium: 2, iron: 1.8, vitaminB1: 0.2, vitaminB12: 0 }
		),
		food('f2', 'selected', {
			name: 'Bündner Käse',
			servingSize: 30,
			servingUnit: 'g',
			calories: 118,
			protein: 8,
			carbs: 0.1,
			fat: 9.5,
			fiber: 0,
			labels: ['cheese']
		}),
		food('f3', 'ingredient', {
			name: 'Honig',
			servingSize: 20,
			servingUnit: 'g',
			calories: 61,
			protein: 0.1,
			carbs: 16.4,
			fat: 0,
			fiber: 0,
			imageUrl: 'https://images.openfoodfacts.org/images/products/honey.jpg'
		}),
		food('f4', 'selected', {
			name: 'Vollmilch',
			brand: 'Emmi',
			servingSize: 250,
			servingUnit: 'ml',
			calories: 165,
			protein: 8.3,
			carbs: 11.8,
			fat: 9.3,
			fiber: 0,
			labels: ['milk']
		})
	],
	recipes: [
		{
			ref: 'r1',
			name: 'Porridge',
			totalServings: 2,
			cookedWeight: 450,
			image: 'images/r1.webp',
			ingredients: [
				{ food: 'f1', quantity: 80, servingUnit: 'g' },
				{ food: 'f4', quantity: 300, servingUnit: 'ml' },
				{ food: 'f3', quantity: 20, servingUnit: 'g' }
			]
		}
	]
};

const README = `Bissbilanz food package
=======================

A collection of foods and recipes to share with other Bissbilanz users.
Import it in Bissbilanz under Foods -> Import -> Food package.

bissbilanz-foods.json   Foods, recipes and their ingredients.
images/                 Photos of the foods and recipes.
`;

const files: Zippable = {
	'README.txt': strToU8(README),
	'bissbilanz-foods.json': strToU8(JSON.stringify(manifest, null, '\t')),
	'images/f1.webp': [new Uint8Array(await webp({ r: 200, g: 160, b: 80 })), { level: 0 }],
	'images/r1.webp': [new Uint8Array(await webp({ r: 230, g: 220, b: 200 })), { level: 0 }]
};

await writeFile(
	join(dir, 'server-export.bissbilanz'),
	zipSync(files, { level: 6, mtime: Date.UTC(2026, 8, 28, 10) })
);
console.log('wrote server-export.bissbilanz');
