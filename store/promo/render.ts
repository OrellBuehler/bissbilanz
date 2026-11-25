import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { feature, targets, type Locale } from './config';
import { renderFeature, renderSlide } from './template';

const { values } = parseArgs({
	options: {
		only: { type: 'string', multiple: true },
		locale: { type: 'string', multiple: true },
		target: { type: 'string', multiple: true }
	}
});

const root = import.meta.dir;
const outDir = join(root, 'out');
const fontsDir = pathToFileURL(resolve(root, '../../node_modules/@fontsource-variable')).href;
const locales = (values.locale ?? ['en', 'de']) as Locale[];
const targetKeys = values.target ?? [...Object.keys(targets), 'play-feature'];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const key of targetKeys) {
	if (key === 'play-feature') {
		await page.setViewportSize({ width: feature.width, height: feature.height });
		const dir = join(outDir, key);
		await mkdir(dir, { recursive: true });
		const iconUrl = pathToFileURL(resolve(root, '../../static/icon.svg')).href;
		for (const locale of locales) {
			const htmlPath = join(dir, `${locale}.html`);
			await writeFile(htmlPath, renderFeature(locale, iconUrl, fontsDir));
			await page.goto(pathToFileURL(htmlPath).href);
			await page.evaluate(() => document.fonts.ready);
			const png = await page.screenshot({ type: 'png' });
			await sharp(png)
				.flatten()
				.toFile(join(dir, `${locale}.png`));
			console.log(`${key}/${locale}.png`);
		}
		continue;
	}

	const target = targets[key];
	if (!target) throw new Error(`unknown target ${key}`);
	const { width, height, device, slides } = target;
	const selected = slides.filter((s) => !values.only || values.only.includes(s.id));
	await page.setViewportSize({ width, height });

	for (const locale of locales) {
		const screensDir = join(root, target.screens.replace('{locale}', locale));
		if (!existsSync(screensDir)) {
			console.warn(`skipped ${key}/${locale}: no raw screenshots in ${screensDir}`);
			continue;
		}
		const dir = join(outDir, key, locale);
		// A full render replaces the set, so a renamed or dropped slide leaves no stale image.
		if (selected.length === target.slides.length) await rm(dir, { recursive: true, force: true });
		await mkdir(join(dir, 'html'), { recursive: true });

		for (const slide of selected) {
			const screenPath = join(screensDir, slide.screen);
			const meta = await sharp(screenPath).metadata();
			const html = renderSlide({
				slide,
				locale,
				width,
				height,
				screenUrl: pathToFileURL(screenPath).href,
				screenSize: { width: meta.width!, height: meta.height! },
				device,
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
			console.log(`${key}/${locale}/${name}`);
		}
	}
}

await browser.close();
