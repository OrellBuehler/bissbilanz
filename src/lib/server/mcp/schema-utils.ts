import type { z } from 'zod';

export function describeShape<S extends z.ZodRawShape>(
	shape: S,
	docs: Partial<Record<keyof S & string, string>>
): S {
	const out: Record<string, z.ZodType> = {};
	for (const [key, schema] of Object.entries(shape)) {
		const doc = docs[key as keyof S & string];
		out[key] = doc ? (schema as z.ZodType).describe(doc) : (schema as z.ZodType);
	}
	return out as unknown as S;
}
