import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The nutrition-label scanner runs Tesseract entirely in the browser. Its worker,
 * wasm core and language data are self-hosted instead of pulled from a CDN so the
 * strict CSP (`default-src 'self'`) keeps holding and the assets stay available
 * offline once fetched.
 *
 * They are far too large to commit, so this plugin stages them from node_modules
 * into `static/ocr/<tesseract version>/` on dev-server start and before a build.
 * The version segment keeps a bumped Tesseract from being served a stale core out
 * of the runtime cache.
 */

const modules = (...segments: string[]) => path.join(process.cwd(), 'node_modules', ...segments);

const tesseractDir = () => modules('tesseract.js');
const coreDir = () => modules('tesseract.js-core');
const langDir = (lang: string) => modules('@tesseract.js-data', lang, '4.0.0_best_int');

/** Only the LSTM cores are needed — the worker is created with OEM.LSTM_ONLY. */
const CORE_FILES = [
	'tesseract-core-lstm.wasm.js',
	'tesseract-core-simd-lstm.wasm.js',
	'tesseract-core-relaxedsimd-lstm.wasm.js'
];

const LANGS = ['eng', 'deu'];

export const ocrAssetVersion = (): string =>
	JSON.parse(readFileSync(path.join(tesseractDir(), 'package.json'), 'utf8')).version;

/** Public URL prefix the browser loads the staged assets from. */
export const ocrAssetBase = (): string => `/ocr/${ocrAssetVersion()}`;

const copyInto = (from: string, dir: string) => {
	const target = path.join(dir, path.basename(from));
	if (!existsSync(target)) copyFileSync(from, target);
};

const stageAssets = () => {
	const dir = path.join(process.cwd(), 'static', 'ocr', ocrAssetVersion());
	const lang = path.join(dir, 'lang');
	mkdirSync(lang, { recursive: true });

	copyInto(path.join(tesseractDir(), 'dist', 'worker.min.js'), dir);
	for (const file of CORE_FILES) copyInto(path.join(coreDir(), file), dir);
	for (const code of LANGS) copyInto(path.join(langDir(code), `${code}.traineddata.gz`), lang);
};

export const ocrAssets = (): Plugin => ({
	name: 'bissbilanz-ocr-assets',
	buildStart: stageAssets
});
