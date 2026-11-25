import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { feature, heroScreens, og, targets, webHero, type Locale } from './config';
import { renderBanner, renderPanorama, renderPhone, renderSlide, type Screen } from './template';

const { values } = parseArgs({
	options: {
		only: { type: 'string', multiple: true },
		locale: { type: 'string', multiple: true },
		target: { type: 'string', multiple: true }
	}
});

const root = import.meta.dir;
const repo = resolve(root, '../..');
const outDir = join(root, 'out');
const fontsDir = pathToFileURL(join(repo, 'node_modules/@fontsource-variable')).href;
const iconUrl = pathToFileURL(join(repo, 'static/icon.svg')).href;
const locales = (values.locale ?? ['en', 'de']) as Locale[];
const extraTargets = ['play-feature', 'og', 'web-hero'];
const targetKeys = values.target ?? [...Object.keys(targets), ...extraTargets];

const browser = await chromium.launch();
const page = await browser.newPage();

const loadScreen = async (dir: string, name: string): Promise<Screen> => {
	const path = join(dir, name);
	const meta = await sharp(path).metadata();
	return { url: pathToFileURL(path).href, size: { width: meta.width, height: meta.height } };
};

const loadHeroScreens = async (dir: string) =>
	(await Promise.all(heroScreens.map((name) => loadScreen(dir, name)))) as [Screen, Screen, Screen];

const shoot = async (htmlPath: string, html: string, width: number, height: number) => {
	await page.setViewportSize({ width, height });
	await writeFile(htmlPath, html);
	await page.goto(pathToFileURL(htmlPath).href);
	await page.evaluate(async () => {
		await document.fonts.ready;
		for (const h1 of document.querySelectorAll<HTMLElement>('.text h1')) {
			let size = parseFloat(getComputedStyle(h1).fontSize);
			const limit = size * 1.04 * 2.2;
			while (h1.getBoundingClientRect().height > limit) {
				size -= 2;
				h1.style.fontSize = `${size}px`;
			}
		}
	});
};

for (const key of targetKeys) {
	if (key === 'play-feature') {
		const dir = join(outDir, key);
		await mkdir(dir, { recursive: true });
		for (const locale of locales) {
			const html = renderBanner({
				width: feature.width,
				height: feature.height,
				title: 'Bissbilanz',
				tagline: feature.tagline[locale],
				note: feature.note[locale],
				iconUrl,
				fontsDir,
				device: 'android',
				screens: await loadHeroScreens(join(root, feature.screens.replace('{locale}', locale)))
			});
			await shoot(join(dir, `${locale}.html`), html, feature.width, feature.height);
			await sharp(await page.screenshot({ type: 'png' }))
				.flatten()
				.toFile(join(dir, `${locale}.png`));
			console.log(`${key}/${locale}.png`);
		}
		continue;
	}

	if (key === 'og') {
		const dir = join(outDir, key);
		await mkdir(dir, { recursive: true });
		const html = renderBanner({
			width: og.width,
			height: og.height,
			title: 'Bissbilanz',
			tagline: og.tagline,
			note: og.note,
			iconUrl,
			fontsDir,
			device: 'iphone',
			screens: await loadHeroScreens(join(root, og.screens))
		});
		await shoot(join(dir, 'og.html'), html, og.width, og.height);
		await sharp(await page.screenshot({ type: 'png' }))
			.flatten()
			.png({ compressionLevel: 9, palette: true, quality: 90 })
			.toFile(join(repo, 'static/og-image.png'));
		console.log('static/og-image.png');
		continue;
	}

	if (key === 'web-hero') {
		const dir = join(outDir, key);
		const staticDir = join(repo, 'static/landing');
		await mkdir(dir, { recursive: true });
		await mkdir(staticDir, { recursive: true });
		for (const locale of locales) {
			const screensDir = join(root, webHero.screens.replace('{locale}', locale));
			for (const name of heroScreens) {
				const phone = renderPhone(await loadScreen(screensDir, name), webHero.width, 'iphone');
				await shoot(join(dir, 'phone.html'), phone.html, phone.width, phone.height);
				const file = `${name.replace('.png', '')}-${locale}.webp`;
				await sharp(await page.screenshot({ type: 'png', omitBackground: true }))
					.webp({ quality: 82 })
					.toFile(join(staticDir, file));
				console.log(`static/landing/${file} ${phone.width}x${phone.height}`);
			}
		}
		continue;
	}

	const target = targets[key];
	if (!target) throw new Error(`unknown target ${key}`);
	const { width, height, device, slides } = target;
	const selected = slides.filter((s) => !values.only || values.only.includes(s.id));
	const fileName = (index: number) =>
		`${String(index + 1).padStart(2, '0')}-${slides[index].id}.png`;

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
			const index = slides.indexOf(slide);
			// The first three come from the panorama below.
			if (index < 3) continue;
			const screen = await loadScreen(screensDir, slide.screen);
			const html = renderSlide({
				slide,
				locale,
				width,
				height,
				screenUrl: screen.url,
				screenSize: screen.size,
				device,
				fontsDir
			});
			await shoot(join(dir, 'html', `${slide.id}.html`), html, width, height);
			await sharp(await page.screenshot({ type: 'png' }))
				.flatten()
				.toFile(join(dir, fileName(index)));
			console.log(`${key}/${locale}/${fileName(index)}`);
		}

		if (selected.some((slide) => slides.indexOf(slide) < 3)) {
			const lead = slides.slice(0, 3);
			const html = renderPanorama({
				width,
				height,
				locale,
				device,
				fontsDir,
				slides: lead,
				front: await Promise.all(lead.map((slide) => loadScreen(screensDir, slide.screen))),
				back: await Promise.all(target.panoramaBack.map((name) => loadScreen(screensDir, name)))
			});
			await shoot(join(dir, 'html', 'panorama.html'), html, width * 3, height);
			const wide = sharp(await page.screenshot({ type: 'png' })).flatten();
			await wide.clone().toFile(join(dir, 'panorama.png'));
			for (let i = 0; i < 3; i++) {
				await wide
					.clone()
					.extract({ left: i * width, top: 0, width, height })
					.toFile(join(dir, fileName(i)));
				console.log(`${key}/${locale}/${fileName(i)}`);
			}
		}
	}
}

await browser.close();
