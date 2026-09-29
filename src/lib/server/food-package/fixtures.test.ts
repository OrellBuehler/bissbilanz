import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { readFoodPackage } from './archive';
import { FOOD_PACKAGE_EXTENSION } from './format';

const fixtures = join(process.cwd(), 'tests/fixtures/food-package');
const names = readdirSync(fixtures).filter((name) => name.endsWith(FOOD_PACKAGE_EXTENSION));

const isWebp = (bytes: Uint8Array) =>
	new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
	new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';

/**
 * Packages the mobile apps read in their unit tests. `server-export` is laid out like the
 * server exporter's output (generate.ts); the other files are written by the apps' own
 * exporters, so this is where a package one platform writes is proven readable by the server.
 */
describe('shared food package fixtures', () => {
	it('has the server export and every mobile export', () => {
		expect(names).toContain(`server-export${FOOD_PACKAGE_EXTENSION}`);
		expect(names).toContain(`android-export${FOOD_PACKAGE_EXTENSION}`);
	});

	it.each(names)('%s passes the server package reader', (name) => {
		const pkg = readFoodPackage(new Uint8Array(readFileSync(join(fixtures, name))));
		const { manifest } = pkg;
		expect(manifest.foods.length).toBeGreaterThan(0);

		const refs = new Set(manifest.foods.map((food) => food.ref));
		for (const recipe of manifest.recipes) {
			for (const ingredient of recipe.ingredients) expect(refs.has(ingredient.food)).toBe(true);
		}

		// Every image the manifest names is present and readable.
		const paths = [
			...manifest.foods.map((food) => food.image),
			...manifest.recipes.map((recipe) => recipe.image)
		].filter((path): path is string => !!path);
		const images = pkg.readImages(paths);
		expect([...images.keys()].sort()).toEqual([...new Set(paths)].sort());
		for (const bytes of images.values()) expect(bytes.length).toBeGreaterThan(0);
	});

	it('server-export carries a webp photo, an umlaut name and a recipe', () => {
		const pkg = readFoodPackage(
			new Uint8Array(readFileSync(join(fixtures, `server-export${FOOD_PACKAGE_EXTENSION}`)))
		);
		expect(pkg.manifest.foods.map((food) => food.name)).toContain('Bündner Käse');
		expect(pkg.manifest.recipes).toHaveLength(1);
		expect(isWebp(pkg.readImages(['images/f1.webp']).get('images/f1.webp')!)).toBe(true);
	});
});

describe('mobile nutrient list', () => {
	it('matches the 43 extended nutrients of src/lib/nutrients.ts', () => {
		const source = readFileSync(
			join(
				process.cwd(),
				'mobile/shared/src/commonMain/kotlin/com/bissbilanz/foodpackage/FoodPackageManifest.kt'
			),
			'utf8'
		);
		const block = /EXTENDED_NUTRIENT_KEYS[^=]*=\s*listOf\(([\s\S]*?)\n\s*\)\n/.exec(source)?.[1];
		expect(block).toBeTruthy();
		const keys = [...block!.matchAll(/"([A-Za-z0-9]+)"/g)].map((match) => match[1]);
		expect(keys).toEqual(ALL_NUTRIENT_KEYS);
	});
});
