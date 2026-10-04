import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { renderThumbnail } from '$lib/server/images';

const transparentPng = () =>
	sharp({
		create: {
			width: 600,
			height: 300,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 }
		}
	})
		.composite([
			{
				input: {
					create: { width: 200, height: 200, channels: 4, background: '#ff0000' }
				},
				left: 200,
				top: 50
			}
		])
		.png()
		.toBuffer();

describe('renderThumbnail keeps transparency from subject cut-outs', () => {
	test.each(['cover', 'inside'] as const)(
		'fit %s yields WebP with an alpha channel',
		async (fit) => {
			const out = await renderThumbnail(await transparentPng(), { fit });
			const meta = await sharp(out).metadata();
			expect(meta.format).toBe('webp');
			expect(meta.hasAlpha).toBe(true);
		}
	);

	test('the transparent corner stays transparent after re-encoding', async () => {
		const out = await renderThumbnail(await transparentPng(), { fit: 'inside' });
		const { data, info } = await sharp(out)
			.raw()
			.ensureAlpha()
			.toBuffer({ resolveWithObject: true });
		expect(data[3]).toBe(0);
		const centre = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
		expect(data[centre + 3]).toBe(255);
	});
});
