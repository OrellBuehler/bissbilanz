export type SummaryTile = {
	label: string;
	value: string;
	hint?: string | null;
	accent?: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'neutral';
};

const formatShortDate = (isoDate: string) => {
	const [year, month, day] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
};

export const formatPeriod = (start: string, end: string) =>
	`${formatShortDate(start)} – ${formatShortDate(end)}`;
