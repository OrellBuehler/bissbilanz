export const assertSameOrigin = (origin: string | null, expected: string) => {
	if (!origin) throw new Error('Missing origin');
	if (origin !== expected) throw new Error('Invalid origin');
};
