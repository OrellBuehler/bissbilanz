export const progressColor = (value: number, goal: number) => {
	if (!goal) return 'text-neutral-500';
	if (value / goal > 1) return 'text-red-600';
	return 'text-foreground';
};
