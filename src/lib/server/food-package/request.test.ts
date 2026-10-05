import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { FOOD_PACKAGE_EXTENSION, MANIFEST_NAME, MAX_PACKAGE_BYTES } from './format';
import { readPackageUpload } from './request';

const manifest = JSON.stringify({
	format: 'bissbilanz.food-package',
	formatVersion: 1,
	foods: [
		{
			ref: 'f1',
			name: 'Oats',
			servingSize: 100,
			servingUnit: 'g',
			calories: 380,
			protein: 13,
			carbs: 67,
			fat: 7,
			fiber: 10
		}
	]
});
const zipped = () => zipSync({ [MANIFEST_NAME]: strToU8(manifest) });

const upload = (bytes: Uint8Array, name: string) => {
	const body = new FormData();
	body.append('file', new File([bytes as BlobPart], name));
	return new Request('http://localhost/api/foods/package/preview', { method: 'POST', body });
};

describe('readPackageUpload', () => {
	it.each([`Lasagne${FOOD_PACKAGE_EXTENSION}`, 'foods.zip', 'foods.bin', 'foods', 'foods.json'])(
		'reads a zip package by its content, not its name (%s)',
		async (name) => {
			const { pkg } = await readPackageUpload(upload(zipped(), name));
			expect(pkg.manifest.foods[0].name).toBe('Oats');
		}
	);

	it.each([`foods${FOOD_PACKAGE_EXTENSION}`, 'foods.zip', 'foods.json'])(
		'reads a bare JSON manifest whatever it is called (%s)',
		async (name) => {
			const { pkg } = await readPackageUpload(upload(strToU8(manifest), name));
			expect(pkg.manifest.foods[0].name).toBe('Oats');
		}
	);

	it('rejects a file that is neither, even with the package extension', async () => {
		await expect(
			readPackageUpload(upload(strToU8('not a package'), `x${FOOD_PACKAGE_EXTENSION}`))
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects a declared size over the limit with the too-large code, before reading the body', async () => {
		const request = upload(zipped(), 'big.bissbilanz');
		request.headers.set('content-length', String(MAX_PACKAGE_BYTES + 128 * 1024));
		await expect(readPackageUpload(request)).rejects.toMatchObject({
			status: 400,
			details: { code: ['package_too_large'] }
		});
	});
});
