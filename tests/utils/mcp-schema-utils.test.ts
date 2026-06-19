import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { describeShape } from '../../src/lib/server/mcp/schema-utils';

describe('describeShape', () => {
	const shape = { name: z.string().min(1), count: z.coerce.number().positive() };

	test('attaches descriptions to documented fields', () => {
		const described = describeShape(shape, { name: 'The name' });
		expect(described.name.description).toBe('The name');
		expect(described.count.description).toBeUndefined();
	});

	test('preserves validation constraints', () => {
		const described = describeShape(shape, { name: 'The name', count: 'The count' });
		expect(described.name.safeParse('').success).toBe(false);
		expect(described.count.safeParse('5').success).toBe(true);
		expect(described.count.safeParse(-1).success).toBe(false);
	});
});
