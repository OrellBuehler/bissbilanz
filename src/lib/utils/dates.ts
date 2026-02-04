export const shiftDate = (isoDate: string, days: number) => {
	const date = new Date(isoDate + 'T00:00:00Z');
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const yesterday = () => shiftDate(today(), -1);
