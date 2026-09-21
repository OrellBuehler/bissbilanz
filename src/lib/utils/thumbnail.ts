const PALETTE = [
	{ bg: 'bg-rose-200', text: 'text-rose-700' },
	{ bg: 'bg-sky-200', text: 'text-sky-700' },
	{ bg: 'bg-amber-200', text: 'text-amber-700' },
	{ bg: 'bg-emerald-200', text: 'text-emerald-700' },
	{ bg: 'bg-violet-200', text: 'text-violet-700' },
	{ bg: 'bg-orange-200', text: 'text-orange-700' },
	{ bg: 'bg-teal-200', text: 'text-teal-700' },
	{ bg: 'bg-pink-200', text: 'text-pink-700' }
] as const;

export type ThumbnailColor = (typeof PALETTE)[number];

/** Same name, same placeholder colour — on every surface that shows a thumbnail. */
export const thumbnailPalette = (name: string): ThumbnailColor => {
	const sum = [...name].reduce((acc, char) => acc + char.codePointAt(0)!, 0);
	return PALETTE[sum % PALETTE.length];
};

/** First character of the name, or `?` for an empty one. */
export const thumbnailInitial = (name: string): string => [...name.trim()][0]?.toUpperCase() ?? '?';
