export const chatChangeDomainValues = [
	'entries',
	'foods',
	'recipes',
	'goals',
	'weight',
	'sleep',
	'supplements',
	'dayProperties',
	'labels',
	'preferences'
] as const;
export type ChatChangeDomain = (typeof chatChangeDomainValues)[number];

// dates: diary days (YYYY-MM-DD) that changed; ids: records that changed. A
// change with neither means "anything in this domain may have changed".
export type ChatChange = { domain: ChatChangeDomain; dates?: string[]; ids?: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const sorted = (values: Set<string>) => [...values].sort();

export function change(
	domain: ChatChangeDomain,
	scope: { dates?: (string | null | undefined)[]; ids?: (string | null | undefined)[] } = {}
): ChatChange {
	const dates = (scope.dates ?? []).filter(
		(value): value is string => typeof value === 'string' && DATE_RE.test(value)
	);
	const ids = (scope.ids ?? []).filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);
	const result: ChatChange = { domain };
	if (dates.length > 0) result.dates = sorted(new Set(dates));
	if (ids.length > 0) result.ids = sorted(new Set(ids));
	return result;
}

/** One change per domain in a fixed order; a domain any change left unscoped stays unscoped. */
export function mergeChanges(changes: ChatChange[]): ChatChange[] {
	const byDomain = new Map<
		ChatChangeDomain,
		{ dates: Set<string>; ids: Set<string>; all: boolean }
	>();
	for (const item of changes) {
		const entry = byDomain.get(item.domain) ?? { dates: new Set(), ids: new Set(), all: false };
		if (!item.dates?.length && !item.ids?.length) entry.all = true;
		for (const date of item.dates ?? []) entry.dates.add(date);
		for (const id of item.ids ?? []) entry.ids.add(id);
		byDomain.set(item.domain, entry);
	}
	return chatChangeDomainValues.flatMap((domain) => {
		const entry = byDomain.get(domain);
		if (!entry) return [];
		if (entry.all) return [{ domain }];
		const result: ChatChange = { domain };
		if (entry.dates.size > 0) result.dates = sorted(entry.dates);
		if (entry.ids.size > 0) result.ids = sorted(entry.ids);
		return [result];
	});
}

export const changedDomains = (changes: ChatChange[]): ChatChangeDomain[] =>
	mergeChanges(changes).map((item) => item.domain);

export function parseChanges(value: unknown): ChatChange[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is ChatChange =>
			!!item &&
			typeof item === 'object' &&
			(chatChangeDomainValues as readonly string[]).includes((item as ChatChange).domain)
	);
}
