export type SummaryTile = {
	label: string;
	value: string;
	hint?: string | null;
	accent?: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'neutral';
};
