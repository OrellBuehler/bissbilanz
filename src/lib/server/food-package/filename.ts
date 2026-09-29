import { FOOD_PACKAGE_EXTENSION } from './format';

const MAX_NAME_LENGTH = 80;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const CONTROL_AND_FORMAT_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const FORBIDDEN_CHARS = /[/\\<>:"|?*'`´‘’“”„]/g;

const TRANSLITERATION: Record<string, string> = {
	ä: 'ae',
	ö: 'oe',
	ü: 'ue',
	Ä: 'Ae',
	Ö: 'Oe',
	Ü: 'Ue',
	ß: 'ss',
	æ: 'ae',
	Æ: 'AE',
	œ: 'oe',
	Œ: 'OE',
	ø: 'o',
	Ø: 'O',
	đ: 'd',
	Đ: 'D',
	ł: 'l',
	Ł: 'L'
};

/** Make a food or recipe name safe as a file name on every OS; empty if nothing is left. */
export const sanitizeFilenameBase = (name: string): string => {
	const cleaned = Array.from(
		name.replace(CONTROL_AND_FORMAT_CHARS, ' ').replace(FORBIDDEN_CHARS, ' ').replace(/\s+/g, ' ')
	)
		.slice(0, MAX_NAME_LENGTH)
		.join('')
		.trim()
		// Windows drops trailing dots and spaces; a leading dot hides the file.
		.replace(/^[. ]+|[. ]+$/g, '');
	return WINDOWS_RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
};

/** Plain-ASCII version for the legacy `filename="..."` parameter. */
export const asciiFilename = (name: string): string =>
	name
		.replace(/[äöüÄÖÜßæÆœŒøØđĐłŁ]/g, (char) => TRANSLITERATION[char])
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^A-Za-z0-9 ._()+,&@!#=~^-]/g, '_')
		.replace(/_{2,}/g, '_')
		.replace(/^[._ ]+/, '')
		.trim();

export type PackageContent = {
	/** Names of the exported recipes. */
	recipes: string[];
	/** Names of the foods picked themselves, not the ingredient foods a recipe pulled in. */
	foods: string[];
};

const genericBase = (date: Date) => `bissbilanz-foods-${date.toISOString().slice(0, 10)}`;

/**
 * Name of the download: the recipe or food when the package is about exactly
 * one of them, otherwise a generic dated name.
 */
export function packageFilename(content: PackageContent, date = new Date()): string {
	const single =
		content.recipes.length === 1 && content.foods.length === 0
			? content.recipes[0]
			: content.recipes.length === 0 && content.foods.length === 1
				? content.foods[0]
				: null;
	const base = single === null ? '' : sanitizeFilenameBase(single);
	return `${base || genericBase(date)}${FOOD_PACKAGE_EXTENSION}`;
}

const rfc5987 = (value: string) =>
	encodeURIComponent(value).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);

/** `attachment` header with an ASCII fallback plus the RFC 5987 UTF-8 name. */
export function contentDisposition(filename: string, date = new Date()): string {
	const base = filename.endsWith(FOOD_PACKAGE_EXTENSION)
		? filename.slice(0, -FOOD_PACKAGE_EXTENSION.length)
		: filename;
	const ascii = asciiFilename(base);
	const usable = `${/[A-Za-z0-9]/.test(ascii) ? ascii : genericBase(date)}${FOOD_PACKAGE_EXTENSION}`;
	return `attachment; filename="${usable}"; filename*=UTF-8''${rfc5987(filename)}`;
}
