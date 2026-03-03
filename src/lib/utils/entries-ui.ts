export const formatEntryLabel = (
	name: string,
	servings: number,
	servingSize?: number | null,
	servingUnit?: string | null
) => {
	if (servingSize && servingUnit) {
		const amount = Math.round(servings * servingSize * 10) / 10;
		return `${name} × ${amount} ${servingUnit}`;
	}
	if (servings === 1 && !servingSize && !servingUnit) {
		return name;
	}
	return `${name} × ${servings}`;
};
