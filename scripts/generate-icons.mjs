#!/usr/bin/env node
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SVG_SOURCE = join(ROOT, 'static/icon.svg');

const svgBuffer = readFileSync(SVG_SOURCE);

function ensureDir(dir) {
	mkdirSync(dir, { recursive: true });
}

async function generatePng(size, outputPath, options = {}) {
	const { padding = 0, background } = options;
	const iconSize = Math.round(size * (1 - padding * 2));
	const offset = Math.round(size * padding);

	let pipeline = sharp(svgBuffer).resize(iconSize, iconSize, {
		fit: 'contain',
		background: { r: 0, g: 0, b: 0, alpha: 0 }
	});

	if (padding > 0 || background) {
		pipeline = pipeline.extend({
			top: offset,
			bottom: size - iconSize - offset,
			left: offset,
			right: size - iconSize - offset,
			background: background || { r: 0, g: 0, b: 0, alpha: 0 }
		});
	}

	await pipeline.png().toFile(outputPath);
	console.log(`  ${outputPath.replace(ROOT + '/', '')}`);
}

async function generateIco(sizes, outputPath) {
	const pngBuffers = await Promise.all(
		sizes.map((size) =>
			sharp(svgBuffer)
				.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
				.png()
				.toBuffer()
		)
	);

	const icoBuffer = createIco(pngBuffers, sizes);
	writeFileSync(outputPath, icoBuffer);
	console.log(`  ${outputPath.replace(ROOT + '/', '')}`);
}

function createIco(pngBuffers, sizes) {
	const headerSize = 6;
	const dirEntrySize = 16;
	const numImages = pngBuffers.length;
	let dataOffset = headerSize + dirEntrySize * numImages;

	const header = Buffer.alloc(headerSize);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(numImages, 4);

	const dirEntries = [];
	const imageDataParts = [];

	for (let i = 0; i < numImages; i++) {
		const png = pngBuffers[i];
		const size = sizes[i] >= 256 ? 0 : sizes[i];
		const entry = Buffer.alloc(dirEntrySize);
		entry.writeUInt8(size, 0);
		entry.writeUInt8(size, 1);
		entry.writeUInt8(0, 2);
		entry.writeUInt8(0, 3);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(png.length, 8);
		entry.writeUInt32LE(dataOffset, 12);
		dirEntries.push(entry);
		imageDataParts.push(png);
		dataOffset += png.length;
	}

	return Buffer.concat([header, ...dirEntries, ...imageDataParts]);
}

async function generateWeb() {
	console.log('\nWeb / PWA icons:');
	const staticDir = join(ROOT, 'static');

	await generateIco([16, 32, 48], join(staticDir, 'favicon.ico'));
	await generatePng(192, join(staticDir, 'icon-192.png'));
	await generatePng(512, join(staticDir, 'icon-512.png'));
	await generatePng(180, join(staticDir, 'apple-touch-icon.png'));
}

async function generateAndroid() {
	console.log('\nAndroid icons:');
	const resDir = join(ROOT, 'mobile/androidApp/src/androidMain/res');

	const densities = [
		{ name: 'mipmap-mdpi', size: 48 },
		{ name: 'mipmap-hdpi', size: 72 },
		{ name: 'mipmap-xhdpi', size: 96 },
		{ name: 'mipmap-xxhdpi', size: 144 },
		{ name: 'mipmap-xxxhdpi', size: 192 }
	];

	for (const { name, size } of densities) {
		const dir = join(resDir, name);
		ensureDir(dir);
		await generatePng(size, join(dir, 'ic_launcher.png'));
		await generatePng(size, join(dir, 'ic_launcher_round.png'));
	}

	const fgDensities = [
		{ name: 'mipmap-mdpi', size: 108 },
		{ name: 'mipmap-hdpi', size: 162 },
		{ name: 'mipmap-xhdpi', size: 216 },
		{ name: 'mipmap-xxhdpi', size: 324 },
		{ name: 'mipmap-xxxhdpi', size: 432 }
	];

	for (const { name, size } of fgDensities) {
		const dir = join(resDir, name);
		ensureDir(dir);
		await generatePng(size, join(dir, 'ic_launcher_foreground.png'), { padding: 0.25 });
	}

	const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
	const anydpiDir = join(resDir, 'mipmap-anydpi-v26');
	ensureDir(anydpiDir);
	writeFileSync(join(anydpiDir, 'ic_launcher.xml'), adaptiveXml);
	writeFileSync(join(anydpiDir, 'ic_launcher_round.xml'), adaptiveXml);
	console.log(`  mobile/androidApp/src/androidMain/res/mipmap-anydpi-v26/ic_launcher.xml`);
	console.log(`  mobile/androidApp/src/androidMain/res/mipmap-anydpi-v26/ic_launcher_round.xml`);

	const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`;
	const valuesDir = join(resDir, 'values');
	ensureDir(valuesDir);

	const existingColors = join(valuesDir, 'ic_launcher_background.xml');
	writeFileSync(existingColors, colorsXml);
	console.log(`  mobile/androidApp/src/androidMain/res/values/ic_launcher_background.xml`);
}

async function generateIos() {
	console.log('\niOS icons:');
	const assetDir = join(ROOT, 'mobile/iosApp/Bissbilanz/Assets.xcassets/AppIcon.appiconset');
	ensureDir(assetDir);

	const sizes = [
		{ size: 20, scales: [2, 3] },
		{ size: 29, scales: [2, 3] },
		{ size: 38, scales: [2, 3] },
		{ size: 40, scales: [2, 3] },
		{ size: 60, scales: [2, 3] },
		{ size: 64, scales: [2, 3] },
		{ size: 68, scales: [2] },
		{ size: 76, scales: [2] },
		{ size: 83.5, scales: [2] },
		{ size: 1024, scales: [1] }
	];

	const images = [];

	for (const { size, scales } of sizes) {
		for (const scale of scales) {
			const px = Math.round(size * scale);
			const filename = `icon-${size}x${size}@${scale}x.png`;
			await generatePng(px, join(assetDir, filename));
			images.push({
				filename,
				idiom: 'universal',
				platform: size <= 60 ? 'ios' : size === 1024 ? 'ios' : 'ios',
				scale: `${scale}x`,
				size: `${size}x${size}`
			});
		}
	}

	const contents = {
		images: images.map((img) => ({
			filename: img.filename,
			idiom: 'universal',
			scale: img.scale,
			size: img.size
		})),
		info: {
			author: 'xcode',
			version: 1
		}
	};

	writeFileSync(join(assetDir, 'Contents.json'), JSON.stringify(contents, null, 2) + '\n');
	console.log(`  mobile/iosApp/Bissbilanz/Assets.xcassets/AppIcon.appiconset/Contents.json`);
}

async function main() {
	console.log(`Generating icons from: static/icon.svg\n`);

	await generateWeb();
	await generateAndroid();
	await generateIos();

	console.log('\nDone! All icons generated.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
