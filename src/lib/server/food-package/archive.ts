import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { ApiError } from '$lib/server/errors';
import { isZip } from '$lib/server/import';
import {
	foodPackageManifestSchema,
	type FoodPackageManifest
} from '$lib/server/validation/food-package';
import {
	FOOD_PACKAGE_FORMAT,
	FOOD_PACKAGE_VERSION,
	MANIFEST_NAME,
	MAX_IMAGE_ENTRY_BYTES,
	MAX_MANIFEST_BYTES,
	MAX_PACKAGE_BYTES,
	MAX_TOTAL_INFLATED_BYTES,
	MAX_ZIP_ENTRIES
} from './format';

export type FoodPackageFile = {
	manifest: FoodPackageManifest;
	/** sha256 of the uploaded bytes; ties a commit to the file its preview was made from. */
	packageHash: string;
	/** Inflate just these manifest image paths. Missing or oversized entries are absent. */
	readImages: (paths: string[]) => Map<string, Uint8Array>;
};

/** Same shape the manifest schema enforces; re-checked so no other entry is ever inflated. */
const IMAGE_PATH = /^images\/[a-z0-9]+\.(webp|jpe?g|png)$/;

export const WRONG_FILE_ACCOUNT_EXPORT =
	'This is a full account export — import it under Settings → Import data instead';

/** The manifest at the root, or inside one top-level folder (re-zipped by a file manager). */
const manifestPrefix = (name: string): string | null => {
	if (name === MANIFEST_NAME) return '';
	const match = /^([^/]+\/)bissbilanz-foods\.json$/.exec(name);
	return match ? match[1] : null;
};

const parseManifest = (text: string): FoodPackageManifest => {
	let raw: unknown;
	try {
		raw = JSON.parse(text.replace(/^﻿/, ''));
	} catch {
		throw new ApiError(400, 'Unrecognized file: expected a Bissbilanz food package');
	}
	const header = raw as { format?: unknown; formatVersion?: unknown } | null;
	if (header && typeof header === 'object' && header.format !== FOOD_PACKAGE_FORMAT) {
		if ('foods' in header && 'formatVersion' in header && !('format' in header)) {
			throw new ApiError(400, WRONG_FILE_ACCOUNT_EXPORT);
		}
		throw new ApiError(400, 'Unrecognized file: expected a Bissbilanz food package');
	}
	if (typeof header?.formatVersion === 'number' && header.formatVersion > FOOD_PACKAGE_VERSION) {
		throw new ApiError(
			400,
			'This package was made by a newer version of Bissbilanz — update first'
		);
	}
	const result = foodPackageManifestSchema.safeParse(raw);
	if (!result.success) {
		const first = result.error.issues[0];
		throw new ApiError(
			400,
			`Invalid food package: ${first?.path.join('.') || 'file'} — ${first?.message ?? 'unreadable'}`
		);
	}
	return result.data;
};

/**
 * Open an uploaded package without trusting any of its sizes.
 *
 * Only the manifest is inflated up front, and only below a cap. Images are
 * inflated later and only for exact paths the manifest names and the import
 * actually needs, each under its own cap and a running total — a zip entry's
 * declared size is attacker-controlled, and fflate bounds its output buffer by
 * it, so the cap on the declared size is also the cap on memory.
 */
export function readFoodPackage(bytes: Uint8Array): FoodPackageFile {
	if (bytes.length === 0) throw new ApiError(400, 'The file is empty');
	if (bytes.length > MAX_PACKAGE_BYTES) {
		throw new ApiError(400, `File must be ${MAX_PACKAGE_BYTES / 1024 / 1024}MB or smaller`);
	}
	const packageHash = createHash('sha256').update(bytes).digest('hex');

	if (!isZip(bytes)) {
		if (bytes.length > MAX_MANIFEST_BYTES) {
			throw new ApiError(400, 'Unrecognized file: expected a Bissbilanz food package');
		}
		return {
			manifest: parseManifest(strFromU8(bytes)),
			packageHash,
			readImages: () => new Map()
		};
	}

	let entries = 0;
	let prefix: string | null = null;
	let accountExport = false;
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes, {
			filter: (file) => {
				if (++entries > MAX_ZIP_ENTRIES) throw new ApiError(400, 'The archive has too many files');
				const found = manifestPrefix(file.name);
				if (found !== null && prefix === null && file.originalSize <= MAX_MANIFEST_BYTES) {
					prefix = found;
					return true;
				}
				if (file.name.endsWith('bissbilanz.json')) accountExport = true;
				return false;
			}
		});
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(400, 'The archive is damaged and cannot be read');
	}

	const manifestBytes = Object.values(files)[0];
	if (!manifestBytes || prefix === null) {
		throw new ApiError(
			400,
			accountExport
				? WRONG_FILE_ACCOUNT_EXPORT
				: 'The archive does not contain a readable bissbilanz-foods.json'
		);
	}
	const root: string = prefix;
	const manifest = parseManifest(strFromU8(manifestBytes));

	const readImages = (paths: string[]): Map<string, Uint8Array> => {
		const wanted = new Set(
			paths.filter((path) => IMAGE_PATH.test(path)).map((path) => root + path)
		);
		if (wanted.size === 0) return new Map();
		let total = 0;
		const inflated = unzipSync(bytes, {
			filter: (file) => {
				if (!wanted.has(file.name) || file.originalSize > MAX_IMAGE_ENTRY_BYTES) return false;
				if (total + file.originalSize > MAX_TOTAL_INFLATED_BYTES) return false;
				total += file.originalSize;
				return true;
			}
		});
		const images = new Map<string, Uint8Array>();
		for (const [name, content] of Object.entries(inflated)) {
			if (content.length > MAX_IMAGE_ENTRY_BYTES) continue;
			images.set(name.slice(root.length), content);
		}
		return images;
	};

	return { manifest, packageHash, readImages };
}
