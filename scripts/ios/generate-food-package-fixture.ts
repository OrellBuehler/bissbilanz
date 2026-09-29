#!/usr/bin/env bun
// Writes the food package the iOS tests read back:
// mobile/iosApp/BissbilanzTests/Fixtures/FoodPackage/food-package.bissbilanz
//
// It is built exactly the way `buildFoodPackage` (src/lib/server/food-package/export.ts)
// builds one — same manifest shape, same fflate zip with a deflated README and
// manifest and a stored image — so it stands in for a package exported by the server.
// src/lib/server/food-package/ios-fixture.test.ts checks that the committed file is
// accepted by `readFoodPackage` and still matches this description.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { ALL_NUTRIENT_KEYS } from '../../src/lib/nutrients';

export const FIXTURE_PATH = join(
	import.meta.dirname,
	'../../mobile/iosApp/BissbilanzTests/Fixtures/FoodPackage/food-package.bissbilanz'
);

/** An 8x8 red WebP, as `sharp(...).webp()` writes one. */
export const FIXTURE_IMAGE = Uint8Array.from(
	Buffer.from(
		'UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoIAAgAAoBCJaACdLoAA5gA/uuOX6FPtRTsP/nEv5I/QLtAAAA=',
		'base64'
	)
);

const README = `Bissbilanz food package
=======================

A collection of foods and recipes to share with other Bissbilanz users.
Import it in Bissbilanz under Foods -> Import -> Food package.

bissbilanz-foods.json   Foods, recipes and their ingredients.
images/                 Photos of the foods and recipes.
`;

type Nutrients = Record<string, number>;

const food = (
	ref: string,
	role: 'selected' | 'ingredient',
	fields: {
		name: string;
		brand: string | null;
		servingSize: number;
		servingUnit: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		nutrients?: Nutrients;
		barcode?: string | null;
		nutriScore?: string | null;
		novaGroup?: number | null;
		additives?: string[] | null;
		ingredientsText?: string | null;
		labels?: string[];
		image?: string | null;
		imageUrl?: string | null;
	}
) => ({
	ref,
	role,
	name: fields.name,
	brand: fields.brand,
	servingSize: fields.servingSize,
	servingUnit: fields.servingUnit,
	calories: fields.calories,
	protein: fields.protein,
	carbs: fields.carbs,
	fat: fields.fat,
	fiber: fields.fiber,
	...Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, fields.nutrients?.[key] ?? null])),
	barcode: fields.barcode ?? null,
	nutriScore: fields.nutriScore ?? null,
	novaGroup: fields.novaGroup ?? null,
	additives: fields.additives ?? null,
	ingredientsText: fields.ingredientsText ?? null,
	labels: fields.labels ?? [],
	image: fields.image ?? null,
	imageUrl: fields.imageUrl ?? null
});

/** Foods sorted by name, as the exporter numbers them; one recipe over three of them. */
export const buildFixtureManifest = () => ({
	format: 'bissbilanz.food-package',
	formatVersion: 1,
	exportedAt: '2026-09-26T10:00:00.000Z',
	foods: [
		food('f1', 'selected', {
			name: 'Haferflocken',
			brand: 'Alnatura',
			servingSize: 100,
			servingUnit: 'g',
			calories: 372,
			protein: 13.5,
			carbs: 58.7,
			fat: 7,
			fiber: 10,
			nutrients: { saturatedFat: 1.3, sugar: 1.1, sodium: 5, iron: 4.6, magnesium: 130 },
			barcode: '4001234567890',
			nutriScore: 'a',
			novaGroup: 1,
			additives: [],
			ingredientsText: 'Vollkorn-Haferflocken',
			labels: ['cereal', 'oat'],
			imageUrl:
				'https://images.openfoodfacts.org/images/products/400/123/456/789/0/front_de.4.400.jpg'
		}),
		food('f2', 'selected', {
			name: 'Milch',
			brand: 'Migros',
			servingSize: 100,
			servingUnit: 'ml',
			calories: 64,
			protein: 3.3,
			carbs: 4.8,
			fat: 3.5,
			fiber: 0,
			nutrients: { saturatedFat: 2.3, sugar: 4.8, calcium: 120 },
			labels: ['milk']
		}),
		food('f3', 'ingredient', {
			name: 'Olivenöl',
			brand: null,
			servingSize: 100,
			servingUnit: 'ml',
			calories: 884,
			protein: 0,
			carbs: 0,
			fat: 100,
			fiber: 0,
			nutrients: { saturatedFat: 14, monounsaturatedFat: 73 },
			labels: ['oil']
		}),
		food('f4', 'ingredient', {
			name: 'Pasta',
			brand: 'Barilla',
			servingSize: 100,
			servingUnit: 'g',
			calories: 350,
			protein: 12,
			carbs: 71,
			fat: 1.5,
			fiber: 3,
			barcode: '8076800195057',
			labels: ['pasta'],
			image: 'images/f4.webp'
		}),
		food('f5', 'ingredient', {
			name: 'Tomaten',
			brand: null,
			servingSize: 100,
			servingUnit: 'g',
			calories: 18,
			protein: 0.9,
			carbs: 3.9,
			fat: 0.2,
			fiber: 1.2,
			nutrients: { vitaminC: 14, potassium: 237 },
			labels: ['tomato']
		})
	],
	recipes: [
		{
			ref: 'r1',
			name: 'Pasta al pomodoro',
			totalServings: 2,
			cookedWeight: 650,
			image: null,
			ingredients: [
				{ food: 'f4', quantity: 200, servingUnit: 'g' },
				{ food: 'f5', quantity: 400, servingUnit: 'g' },
				{ food: 'f3', quantity: 1, servingUnit: 'tbsp' }
			]
		}
	]
});

/** Same entries and compression choices as `buildFoodPackage`, with a fixed timestamp. */
export const buildFixturePackage = (): Uint8Array => {
	const files: Zippable = {
		'README.txt': strToU8(README),
		'bissbilanz-foods.json': strToU8(JSON.stringify(buildFixtureManifest(), null, '\t')),
		'images/f4.webp': [FIXTURE_IMAGE, { level: 0 }]
	};
	// Local-time components, because that is what a zip's DOS timestamp stores:
	// the file comes out the same in every time zone.
	return zipSync(files, { level: 6, mtime: new Date(2026, 8, 26, 10, 0, 0) });
};

if (import.meta.main) {
	mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
	writeFileSync(FIXTURE_PATH, buildFixturePackage());
	console.log(`Wrote ${FIXTURE_PATH}`);
}
