export const progressColor = (value: number, goal: number) => {
	if (!goal) return 'text-neutral-500';
	const ratio = value / goal;
	if (ratio > 1) return 'text-red-600';
	if (ratio >= 0.9) return 'text-emerald-600';
	if (ratio >= 0.8) return 'text-yellow-600';
	return 'text-red-500';
};
