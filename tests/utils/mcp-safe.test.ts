import { describe, expect, test } from 'vitest';
import { safe } from '../../src/lib/server/mcp/safe';
import { ResultValidationError } from '../../src/lib/server/errors';
import { foodCreateSchema } from '../../src/lib/server/validation/foods';

describe('safe', () => {
	test('wraps successful results as text content without isError', async () => {
		const wrapped = safe(async () => ({ ok: true }));
		const result = await wrapped();
		expect(result.isError).toBeUndefined();
		expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });
	});

	test('marks thrown errors with isError and keeps the message', async () => {
		const wrapped = safe(async () => {
			throw new Error('boom');
		});
		const result = await wrapped();
		expect(result.isError).toBe(true);
		expect(JSON.parse(result.content[0].text)).toEqual({ error: 'boom' });
	});

	test('does not leak non-Error thrown values', async () => {
		const wrapped = safe(async () => {
			throw { secret: 'internal state' };
		});
		const result = await wrapped();
		expect(result.isError).toBe(true);
		expect(result.content[0].text).not.toContain('internal state');
	});

	test('returns structured issues for ResultValidationError', async () => {
		const zodError = foodCreateSchema.safeParse({ name: '' }).error!;
		const wrapped = safe(async () => {
			throw new ResultValidationError(zodError);
		});
		const result = await wrapped();
		expect(result.isError).toBe(true);
		const payload = JSON.parse(result.content[0].text);
		expect(payload.error).toBe('validation_failed');
		expect(payload.issues.some((i: { path: string }) => i.path === 'name')).toBe(true);
	});
});
