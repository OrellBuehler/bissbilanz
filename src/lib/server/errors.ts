import { json, type RequestEvent } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { ZodError } from 'zod';
import { readClientEditedAt } from '$lib/server/sync/headers';

/**
 * Narrow type for postgres.js server errors exposed as `Error.cause`.
 * The underlying driver tags these with `code: 'ERR_POSTGRES_SERVER_ERROR'`
 * and carries SQLSTATE in `errno` plus optional `constraint`/`detail` fields.
 */
type PgErrorCause = {
	code: 'ERR_POSTGRES_SERVER_ERROR';
	errno?: string;
	constraint?: string;
	detail?: string;
};

function isPgErrorCause(value: unknown): value is PgErrorCause {
	return (
		typeof value === 'object' &&
		value !== null &&
		'code' in value &&
		(value as { code: unknown }).code === 'ERR_POSTGRES_SERVER_ERROR'
	);
}

/**
 * Extracts a postgres.js server error from a thrown value, whether it was
 * wrapped as `Error.cause` (Drizzle's usual path) or thrown directly.
 */
function extractPgError(error: unknown): PgErrorCause | null {
	const cause = error instanceof Error ? error.cause : error;
	if (isPgErrorCause(cause)) return cause;
	if (isPgErrorCause(error)) return error;
	return null;
}

/**
 * Custom API error class for throwing errors with status codes
 */
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public details?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/**
 * Returns a 401 Unauthorized response
 */
export function unauthorized() {
	return json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Returns a 404 Not Found response
 * @param resource - Optional resource name to include in error message
 */
export function notFound(resource?: string) {
	const message = resource ? `${resource} not found` : 'Not found';
	return json({ error: message }, { status: 404 });
}

/**
 * Returns a 400 Bad Request response with Zod validation error details
 * @param zodError - The Zod validation error
 */
export function validationError(zodError: ZodError) {
	return json(
		{
			error: 'Validation failed',
			details: zodError.format()
		},
		{ status: 400 }
	);
}

/**
 * Central error handler for API routes
 * Converts various error types to appropriate JSON responses
 * @param error - The error to handle
 */
export function handleApiError(error: unknown): Response {
	if (error instanceof ResultValidationError) {
		return validationError(error.zodError);
	}

	if (error instanceof ApiError) {
		return json(
			{
				error: error.message,
				...(error.details ? { details: error.details } : {})
			},
			{ status: error.status }
		);
	}

	const pg = extractPgError(error);
	if (pg && pg.errno === '23505') {
		const constraint = pg.constraint ?? '';
		if (constraint.includes('barcode')) {
			return json({ error: 'duplicate_barcode' }, { status: 409 });
		}
		return json({ error: 'duplicate_entry' }, { status: 409 });
	}

	Sentry.captureException(error);
	Sentry.logger.error('Unhandled API error', {
		error: error instanceof Error ? error.message : String(error)
	});
	console.error('Unhandled error:', error);

	return json({ error: 'Internal server error' }, { status: 500 });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ApiError(400, 'Invalid JSON body');
	}
}

/**
 * Checks if user is authenticated and returns user ID
 * Throws ApiError if not authenticated
 * @param locals - SvelteKit locals object
 * @returns User ID
 */
export function requireAuth(locals: App.Locals): string {
	if (!locals.user) {
		throw new ApiError(401, 'Unauthorized');
	}
	return locals.user.id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string): string {
	if (!UUID_RE.test(value)) {
		throw new ApiError(400, 'Invalid ID format');
	}
	return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function requireDate(value: string | null, name = 'date'): string {
	if (!value || !DATE_RE.test(value)) {
		throw new ApiError(400, `Invalid ${name} format, expected YYYY-MM-DD`);
	}
	return value;
}

/**
 * Checks if an error is a ZodError
 * @param error - The error to check
 * @returns True if error is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
	return error instanceof ZodError;
}

/**
 * Handles a Result from a service function, converting failures to responses.
 * On validation error returns a 400 response; on other errors re-throws for handleApiError.
 * Returns the data on success, or undefined if the record was not found (for update operations).
 */
export function unwrapResult<T>(result: { success: boolean; data?: T; error?: unknown }): T {
	if (!result.success) {
		if (isZodError(result.error)) {
			throw new ResultValidationError(result.error);
		}
		throw result.error;
	}
	return result.data as T;
}

/**
 * Wrapper error to distinguish validation errors from other thrown errors in handleApiError.
 * Caught by handleApiError and converted to a 400 validation response.
 */
export class ResultValidationError extends Error {
	constructor(public zodError: ZodError) {
		super('Validation failed');
		this.name = 'ResultValidationError';
	}
}

type AuthedResourceEvent<E extends RequestEvent<{ id: string }>> = E & {
	userId: string;
	id: string;
	/**
	 * Client edit timestamp from the `X-Client-Edited-At` header, used for
	 * last-write-wins conflict resolution. Null when absent (online writes from
	 * older clients) — handlers then keep their pre-LWW behaviour.
	 */
	clientEditedAt: Date | null;
};

/**
 * Wraps a route handler with auth + UUID validation + central error handling.
 * The handler receives the same event extended with `userId`, validated `id`,
 * and the parsed `clientEditedAt` (for LWW conflict resolution).
 */
export function withAuthedResource<E extends RequestEvent<{ id: string }>>(
	handler: (event: AuthedResourceEvent<E>) => Response | Promise<Response>
): (event: E) => Promise<Response> {
	return async (event) => {
		try {
			const userId = requireAuth(event.locals);
			const id = requireUuid(event.params.id);
			const clientEditedAt = readClientEditedAt(event.request);
			return await handler({ ...event, userId, id, clientEditedAt } as AuthedResourceEvent<E>);
		} catch (error) {
			return handleApiError(error);
		}
	};
}
