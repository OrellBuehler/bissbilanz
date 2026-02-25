export const formatEntryLabel = (
	name: string,
	servings: number,
	servingSize?: number | null,
	servingUnit?: string | null
) => {
	if (servingSize && servingUnit) {
		const amount = Math.round(servings * servingSize * 10) / 10;
		return `${name} × ${amount}${servingUnit}`;
	}
	return `${name} × ${servings}`;
};
