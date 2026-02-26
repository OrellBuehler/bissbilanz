import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { ZodError } from 'zod';

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
	if (error instanceof ApiError) {
		return json(
			{
				error: error.message,
				...(error.details ? { details: error.details } : {})
			},
			{ status: error.status }
		);
	}

	Sentry.captureException(error);
	Sentry.logger.error('Unhandled API error', {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined
	});

	return json({ error: 'Internal server error' }, { status: 500 });
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

/**
 * Checks if an error is a ZodError
 * @param error - The error to check
 * @returns True if error is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
	return error instanceof ZodError;
}
