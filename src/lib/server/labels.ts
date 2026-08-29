export const MAX_LABELS_PER_FOOD = 20;
export const MAX_LABEL_LENGTH = 40;
export const MAX_LABEL_WORDS = 3;
export const MAX_BATCH_ITEMS = 100;

/**
 * The vocabulary Apple's Visual Intelligence hands us is general en_US nouns
 * ("banana", "bottle", "sandwich"), so matching only works if both sides agree on
 * the exact string. Every write goes through here; nothing else may normalize.
 *
 * Returns null for a label that cannot be matched against that vocabulary
 * (empty, too long, too many words, or written in a non-latin script).
 */
export function normalizeLabel(raw: string): string | null {
	if (typeof raw !== 'string') return null;

	// Decompose then drop the combining marks, so "püree" folds to "puree".
	const folded = raw
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase();

	// A letter that survived folding without becoming ASCII (ß, Cyrillic, CJK, …)
	// means this is not an en_US noun and can never match what the camera emits.
	for (const ch of folded) {
		if (/\p{L}/u.test(ch) && !/[a-z]/.test(ch)) return null;
	}

	const cleaned = folded
		// Apostrophes close up rather than split, so "shepherd's" stays one word.
		.replace(/['\u2018\u2019\u02bc]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
	if (!cleaned) return null;

	const words = cleaned.split(' ');
	if (words.length > MAX_LABEL_WORDS) return null;

	const singular = words.map(singularize).join(' ');
	if (!singular || singular.length > MAX_LABEL_LENGTH) return null;
	return singular;
}

/**
 * Naive English singularization. Deliberately crude: it only has to be
 * *consistent*, since both the stored label and the camera's label are pushed
 * through it before they are compared. Known misses ("cookies" → "cooky") are
 * therefore harmless as long as both sides miss identically.
 */
function singularize(word: string): string {
	if (word.length <= 3) return word;
	// glass, hummus, asparagus, tennis — already singular despite the trailing s.
	if (/(ss|us|is)$/.test(word)) return word;
	if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
	if (/(ches|shes|xes|zes|sses)$/.test(word)) return word.slice(0, -2);
	if (/oes$/.test(word)) return word.slice(0, -2);
	if (word.endsWith('s')) return word.slice(0, -1);
	return word;
}

/** Normalize, drop rejects, dedupe, and cap at {@link MAX_LABELS_PER_FOOD}. */
export function normalizeLabels(raw: string[]): string[] {
	const seen = new Set<string>();
	for (const value of raw) {
		const label = normalizeLabel(value);
		if (label) seen.add(label);
		if (seen.size >= MAX_LABELS_PER_FOOD) break;
	}
	return [...seen];
}
