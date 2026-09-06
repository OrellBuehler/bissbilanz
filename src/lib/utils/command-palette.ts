import { isValidIsoDate, shiftDate, today as todayIso } from '$lib/utils/dates';

const isRealIsoDate = (iso: string): boolean => {
	try {
		return isValidIsoDate(iso);
	} catch {
		return false;
	}
};

const DAY_KEYWORDS: Array<{ words: string[]; offset: number }> = [
	{ words: ['today', 'heute'], offset: 0 },
	{ words: ['yesterday', 'gestern'], offset: -1 },
	{ words: ['tomorrow', 'morgen'], offset: 1 }
];

/**
 * Resolve a typed query to a calendar date, so "2026-01-05", "yesterday" or
 * "gestern" all jump straight to that day's log. Returns null when the query
 * is not a date at all.
 */
export const parseDateQuery = (query: string, today: string = todayIso()): string | null => {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return isRealIsoDate(q) ? q : null;
	const dotted = q.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	if (dotted) {
		const [, d, mo, y] = dotted;
		const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
		return isRealIsoDate(iso) ? iso : null;
	}
	if (q.length < 3) return null;
	for (const { words, offset } of DAY_KEYWORDS) {
		if (words.some((w) => w.startsWith(q))) return shiftDate(today, offset);
	}
	return null;
};

const isSubsequence = (text: string, query: string): boolean => {
	let i = 0;
	for (const char of text) {
		if (char === query[i]) i++;
		if (i === query.length) return true;
	}
	return query.length === 0;
};

/**
 * How well a piece of text answers a query, lower being better:
 *   0 — exact match
 *   1 — the text starts with the query
 *   2 — a word inside the text starts with the query
 *   3 — the query appears somewhere in the text
 *   4 — the query's letters appear in order (fuzzy)
 * `null` means no match at all.
 */
export const matchScore = (text: string, query: string): number | null => {
	const t = text.trim().toLowerCase();
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	if (t === q) return 0;
	if (t.startsWith(q)) return 1;
	if (t.split(/[\s\-/,.()]+/).some((word) => word.startsWith(q))) return 2;
	if (t.includes(q)) return 3;
	if (isSubsequence(t, q)) return 4;
	return null;
};

/**
 * The best score across several searchable strings (name, keywords, …).
 */
export const bestScore = (texts: string[], query: string): number | null => {
	let best: number | null = null;
	for (const text of texts) {
		const score = matchScore(text, query);
		if (score === null) continue;
		if (best === null || score < best) best = score;
	}
	return best;
};

/**
 * Filter and rank items for a query. The sort is stable, so equally scored
 * items keep their input order.
 */
export const rankByQuery = <T>(
	items: T[],
	query: string,
	getTexts: (item: T) => string | string[]
): T[] => {
	if (!query.trim()) return items;
	return items
		.map((item, index) => {
			const texts = getTexts(item);
			return { item, index, score: bestScore(Array.isArray(texts) ? texts : [texts], query) };
		})
		.filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null)
		.sort((a, b) => a.score - b.score || a.index - b.index)
		.map((entry) => entry.item);
};
