import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { slides, sizes, type Locale } from './config';
import { renderSlide } from './template';

const { values } = parseArgs({
	options: {
		only: { type: 'string', multiple: true },
		locale: { type: 'string', multiple: true },
		size: { type: 'string', multiple: true }
	}
});

const root = import.meta.dir;
const outDir = join(root, 'out');
const fontsDir = pathToFileURL(resolve(root, '../../node_modules/@fontsource-variable')).href;
const locales = (values.locale ?? ['en', 'de']) as Locale[];
const sizeKeys = (values.size ?? Object.keys(sizes)) as (keyof typeof sizes)[];
const selected = slides.filter((s) => !values.only || values.only.includes(s.id));

const browser = await chromium.launch();
const page = await browser.newPage();

for (const sizeKey of sizeKeys) {
	const { width, height } = sizes[sizeKey];
	await page.setViewportSize({ width, height });

	for (const locale of locales) {
		const dir = join(outDir, sizeKey, locale);
		await mkdir(join(dir, 'html'), { recursive: true });

		for (const slide of selected) {
			const screenPath = join(root, 'screens', slide.screen);
			const meta = await sharp(screenPath).metadata();
			const html = renderSlide({
				slide,
				locale,
				width,
				height,
				screenUrl: pathToFileURL(screenPath).href,
				screenSize: { width: meta.width!, height: meta.height! },
				fontsDir
			});
			const htmlPath = join(dir, 'html', `${slide.id}.html`);
			await writeFile(htmlPath, html);
			await page.goto(pathToFileURL(htmlPath).href);
			await page.evaluate(async () => {
				await document.fonts.ready;
				const h1 = document.querySelector('h1')!;
				let size = parseFloat(getComputedStyle(h1).fontSize);
				while (h1.getBoundingClientRect().height > size * 1.04 * 2.2) {
					size -= 2;
					h1.style.fontSize = `${size}px`;
				}
			});
			const name = `${String(slides.indexOf(slide) + 1).padStart(2, '0')}-${slide.id}.png`;
			const png = await page.screenshot({ type: 'png' });
			await sharp(png).flatten().toFile(join(dir, name));
			console.log(`${sizeKey}/${locale}/${name}`);
		}
	}
}

await browser.close();
