import { describe, expect, test, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/sveltekit', () => ({
	captureException: (...args: unknown[]) => captureException(...args)
}));

import { safe, type McpResult } from '../../src/lib/server/mcp/safe';
import { ApiError, McpUserError, ResultValidationError } from '../../src/lib/server/errors';
import { foodCreateSchema } from '../../src/lib/server/validation/foods';

describe('asText structuredContent', () => {
	test('mirrors object payloads as structuredContent', async () => {
		const result = await safe(async () => ({ total: 1, items: [1, 2] }))();
		expect(result.structuredContent).toEqual({ total: 1, items: [1, 2] });
		expect(JSON.parse(textOf(result.content[0]))).toEqual(result.structuredContent);
	});

	test('omits structuredContent for non-object payloads', async () => {
		expect((await safe(async () => [1, 2])()).structuredContent).toBeUndefined();
		expect((await safe(async () => 'ok')()).structuredContent).toBeUndefined();
		expect((await safe(async () => null)()).structuredContent).toBeUndefined();
	});
});

const textOf = (block: McpResult['content'][number]): string => {
	if (block.type !== 'text') throw new Error('expected a text content block');
	return block.text;
};

describe('safe', () => {
	test('wraps successful results as text content without isError', async () => {
		const wrapped = safe(async () => ({ ok: true }));
		const result = await wrapped();
		expect(result.isError).toBeUndefined();
		expect(JSON.parse(textOf(result.content[0]))).toEqual({ ok: true });
	});

	test('hides the message of unexpected errors and reports them to Sentry', async () => {
		captureException.mockClear();
		const failure = new Error('Failed query: select * from foods where user_id = $1');
		const result = await safe(async () => {
			throw failure;
		})();
		expect(result.isError).toBe(true);
		expect(textOf(result.content[0])).not.toContain('Failed query');
		expect(JSON.parse(textOf(result.content[0])).error).toMatch(/internal error/i);
		expect(captureException).toHaveBeenCalledWith(failure, expect.anything());
	});

	test('keeps the message of errors written for the caller', async () => {
		captureException.mockClear();
		const userError = await safe(async () => {
			throw new McpUserError('Too many step images');
		})();
		expect(JSON.parse(textOf(userError.content[0]))).toEqual({ error: 'Too many step images' });

		const notFound = await safe(async () => {
			throw new ApiError(404, 'Food not found');
		})();
		expect(JSON.parse(textOf(notFound.content[0]))).toEqual({ error: 'Food not found' });
		expect(notFound.isError).toBe(true);
		expect(captureException).not.toHaveBeenCalled();
	});

	test('reports the cause of a wrapped error but shows only the wrapper message', async () => {
		captureException.mockClear();
		const cause = new Error('connection refused to 10.0.0.5');
		const result = await safe(async () => {
			throw new McpUserError('Failed to log food', { cause });
		})();
		expect(JSON.parse(textOf(result.content[0]))).toEqual({ error: 'Failed to log food' });
		expect(captureException).toHaveBeenCalledWith(cause, expect.anything());
	});

	test('reports an ApiError 5xx instead of exposing it', async () => {
		captureException.mockClear();
		const result = await safe(async () => {
			throw new ApiError(500, 'Failed to save image');
		})();
		expect(JSON.parse(textOf(result.content[0])).error).toMatch(/internal error/i);
		expect(captureException).toHaveBeenCalled();
	});

	test('does not leak non-Error thrown values', async () => {
		const wrapped = safe(async () => {
			throw { secret: 'internal state' };
		});
		const result = await wrapped();
		expect(result.isError).toBe(true);
		expect(textOf(result.content[0])).not.toContain('internal state');
	});

	test('returns structured issues for ResultValidationError', async () => {
		const zodError = foodCreateSchema.safeParse({ name: '' }).error!;
		const wrapped = safe(async () => {
			throw new ResultValidationError(zodError);
		});
		const result = await wrapped();
		expect(result.isError).toBe(true);
		const payload = JSON.parse(textOf(result.content[0]));
		expect(payload.error).toBe('validation_failed');
		expect(payload.issues.some((i: { path: string }) => i.path === 'name')).toBe(true);
	});
});
