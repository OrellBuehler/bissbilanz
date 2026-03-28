import { describe, test, expect, vi } from 'vitest';
import { ZodError, z } from 'zod';
import {
	ApiError,
	ResultValidationError,
	unauthorized,
	notFound,
	validationError,
	handleApiError,
	parseJsonBody,
	requireAuth,
	requireUuid,
	isZodError,
	unwrapResult
} from '../../src/lib/server/errors';

vi.mock('@sentry/sveltekit', () => ({
	captureException: vi.fn(),
	logger: { error: vi.fn() }
}));

function makeZodError(): ZodError {
	const result = z.object({ name: z.string() }).safeParse({});
	if (!result.success) return result.error;
	throw new Error('expected ZodError');
}

describe('ApiError', () => {
	test('sets message, status, and name', () => {
		const err = new ApiError(404, 'Not found');
		expect(err.message).toBe('Not found');
		expect(err.status).toBe(404);
		expect(err.name).toBe('ApiError');
		expect(err).toBeInstanceOf(Error);
	});

	test('stores optional details', () => {
		const err = new ApiError(400, 'Bad', { field: 'x' });
		expect(err.details).toEqual({ field: 'x' });
	});

	test('details is undefined when not provided', () => {
		const err = new ApiError(500, 'Oops');
		expect(err.details).toBeUndefined();
	});
});

describe('ResultValidationError', () => {
	test('wraps a ZodError and sets name', () => {
		const zodError = makeZodError();
		const err = new ResultValidationError(zodError);
		expect(err.zodError).toBe(zodError);
		expect(err.name).toBe('ResultValidationError');
		expect(err.message).toBe('Validation failed');
		expect(err).toBeInstanceOf(Error);
	});
});

describe('unauthorized', () => {
	test('returns 401 JSON response with Unauthorized message', async () => {
		const res = unauthorized();
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe('Unauthorized');
	});
});

describe('notFound', () => {
	test('returns 404 with generic message when no resource given', async () => {
		const res = notFound();
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe('Not found');
	});

	test('returns 404 with resource name in message', async () => {
		const res = notFound('Food');
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe('Food not found');
	});
});

describe('validationError', () => {
	test('returns 400 with validation error details', async () => {
		const zodError = makeZodError();
		const res = validationError(zodError);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe('Validation failed');
		expect(body.details).toBeDefined();
	});
});

describe('handleApiError', () => {
	test('handles ApiError with status and message', async () => {
		const err = new ApiError(422, 'Unprocessable');
		const res = handleApiError(err);
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.error).toBe('Unprocessable');
	});

	test('includes details in ApiError response when present', async () => {
		const err = new ApiError(400, 'Bad input', { field: 'name' });
		const res = handleApiError(err);
		const body = await res.json();
		expect(body.details).toEqual({ field: 'name' });
	});

	test('omits details key from ApiError response when not set', async () => {
		const err = new ApiError(400, 'Bad input');
		const res = handleApiError(err);
		const body = await res.json();
		expect('details' in body).toBe(false);
	});

	test('handles ResultValidationError as 400 validation response', async () => {
		const zodError = makeZodError();
		const err = new ResultValidationError(zodError);
		const res = handleApiError(err);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe('Validation failed');
	});

	test('returns 409 duplicate_entry for postgres 23505 error', async () => {
		const pgErr = Object.assign(new Error('postgres error'), {
			cause: {
				code: 'ERR_POSTGRES_SERVER_ERROR',
				errno: '23505',
				constraint: 'foods_unique'
			}
		});
		const res = handleApiError(pgErr);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toBe('duplicate_entry');
	});

	test('returns 409 duplicate_barcode for 23505 with barcode constraint', async () => {
		const pgErr = Object.assign(new Error('postgres error'), {
			cause: {
				code: 'ERR_POSTGRES_SERVER_ERROR',
				errno: '23505',
				constraint: 'foods_user_id_barcode_unique'
			}
		});
		const res = handleApiError(pgErr);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toBe('duplicate_barcode');
	});

	test('returns 500 for generic Error', async () => {
		const res = handleApiError(new Error('something broke'));
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error).toBe('Internal server error');
	});

	test('returns 500 for non-Error thrown value', async () => {
		const res = handleApiError('string error');
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error).toBe('Internal server error');
	});

	test('does not treat 23503 postgres error as duplicate', async () => {
		const pgErr = Object.assign(new Error('postgres error'), {
			cause: {
				code: 'ERR_POSTGRES_SERVER_ERROR',
				errno: '23503',
				constraint: 'some_fk'
			}
		});
		const res = handleApiError(pgErr);
		expect(res.status).toBe(500);
	});

	test('does not treat 23514 postgres error as duplicate', async () => {
		const pgErr = Object.assign(new Error('postgres error'), {
			cause: {
				code: 'ERR_POSTGRES_SERVER_ERROR',
				errno: '23514',
				constraint: 'some_check'
			}
		});
		const res = handleApiError(pgErr);
		expect(res.status).toBe(500);
	});
});

describe('parseJsonBody', () => {
	test('parses valid JSON', async () => {
		const request = new Request('http://localhost/', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'test' })
		});
		const result = await parseJsonBody(request);
		expect(result).toEqual({ name: 'test' });
	});

	test('throws ApiError 400 for invalid JSON', async () => {
		const request = new Request('http://localhost/', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: 'not json'
		});
		await expect(parseJsonBody(request)).rejects.toBeInstanceOf(ApiError);
		await expect(
			parseJsonBody(
				new Request('http://localhost/', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: 'not json'
				})
			)
		).rejects.toMatchObject({ status: 400, message: 'Invalid JSON body' });
	});

	test('throws ApiError 400 for empty body', async () => {
		const request = new Request('http://localhost/', {
			method: 'POST'
		});
		await expect(parseJsonBody(request)).rejects.toMatchObject({ status: 400 });
	});
});

describe('requireAuth', () => {
	test('returns user id when user is present', () => {
		const locals = { user: { id: 'user-123' } } as any;
		expect(requireAuth(locals)).toBe('user-123');
	});

	test('throws ApiError 401 when user is null', () => {
		const locals = { user: null } as any;
		expect(() => requireAuth(locals)).toThrow(ApiError);
		try {
			requireAuth(locals);
		} catch (err) {
			expect((err as ApiError).status).toBe(401);
		}
	});

	test('throws ApiError 401 when user is undefined', () => {
		const locals = {} as any;
		expect(() => requireAuth(locals)).toThrow(ApiError);
	});
});

describe('requireUuid', () => {
	test('returns valid UUID unchanged', () => {
		const uuid = '10000000-0000-4000-8000-000000000001';
		expect(requireUuid(uuid)).toBe(uuid);
	});

	test('accepts uppercase UUID', () => {
		const uuid = '10000000-0000-4000-8000-000000000001'.toUpperCase();
		expect(requireUuid(uuid)).toBe(uuid);
	});

	test('throws ApiError 400 for missing dashes', () => {
		expect(() => requireUuid('100000000000400080000000000000001')).toThrow(ApiError);
	});

	test('throws ApiError 400 for short string', () => {
		expect(() => requireUuid('not-a-uuid')).toThrow(ApiError);
	});

	test('throws ApiError 400 for empty string', () => {
		expect(() => requireUuid('')).toThrow(ApiError);
	});

	test('throws ApiError 400 for UUID with extra chars', () => {
		expect(() => requireUuid('10000000-0000-4000-8000-000000000001-extra')).toThrow(ApiError);
	});

	test('ApiError has status 400 on invalid format', () => {
		try {
			requireUuid('bad');
		} catch (err) {
			expect((err as ApiError).status).toBe(400);
			expect((err as ApiError).message).toBe('Invalid ID format');
		}
	});
});

describe('isZodError', () => {
	test('returns true for a ZodError', () => {
		expect(isZodError(makeZodError())).toBe(true);
	});

	test('returns false for a regular Error', () => {
		expect(isZodError(new Error('oops'))).toBe(false);
	});

	test('returns false for null', () => {
		expect(isZodError(null)).toBe(false);
	});

	test('returns false for a string', () => {
		expect(isZodError('error')).toBe(false);
	});
});

describe('unwrapResult', () => {
	test('returns data on success', () => {
		const result = { success: true as const, data: { id: '1' } };
		expect(unwrapResult(result)).toEqual({ id: '1' });
	});

	test('returns undefined data when success and data is undefined', () => {
		const result = { success: true as const, data: undefined };
		expect(unwrapResult(result)).toBeUndefined();
	});

	test('throws ResultValidationError when error is ZodError', () => {
		const zodError = makeZodError();
		const result = { success: false as const, error: zodError };
		expect(() => unwrapResult(result)).toThrow(ResultValidationError);
	});

	test('re-throws non-ZodError as-is', () => {
		const err = new Error('db connection failed');
		const result = { success: false as const, error: err };
		expect(() => unwrapResult(result)).toThrow(err);
	});

	test('re-throws ApiError as-is', () => {
		const err = new ApiError(404, 'not found');
		const result = { success: false as const, error: err };
		expect(() => unwrapResult(result)).toThrow(err);
	});
});
