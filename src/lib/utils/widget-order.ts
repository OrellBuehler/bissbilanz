const ALL_SECTION_KEYS = [
	'fasting',
	'water',
	'activity',
	'notes',
	'day-properties',
	'chart',
	'streaks',
	'favorites',
	'recipe-suggestions',
	'supplements',
	'weight',
	'meal-breakdown',
	'top-foods',
	'sleep',
	'summary',
	'daylog'
];

// Sections that sit at the top of the day on mobile; when a stored order
// predates them they go first, every other new key slots in before the day log.
const LEADING_SECTION_KEYS = ['fasting', 'day-properties'];

// Water, activity and notes used to render together as the 'day-properties'
// card. That key stays in the order as a placeholder for clients that predate
// the split; the separate cards slot in right before it when missing.
const DAY_DETAIL_SECTION_KEYS = ['water', 'activity', 'notes'];

export const normalizeSectionOrder = (order: string[]): string[] => {
	const result = order.filter((k) => ALL_SECTION_KEYS.includes(k));
	let leadingInsertAt = 0;
	for (const key of ALL_SECTION_KEYS) {
		if (!result.includes(key)) {
			if (DAY_DETAIL_SECTION_KEYS.includes(key)) {
				const anchor = result.indexOf('day-properties');
				if (anchor >= 0) {
					result.splice(anchor, 0, key);
					continue;
				}
			}
			if (LEADING_SECTION_KEYS.includes(key) || DAY_DETAIL_SECTION_KEYS.includes(key)) {
				result.splice(leadingInsertAt++, 0, key);
				continue;
			}
			const daylogIndex = result.indexOf('daylog');
			if (daylogIndex >= 0) {
				result.splice(daylogIndex, 0, key);
			} else {
				result.push(key);
			}
		}
	}
	return result;
};
