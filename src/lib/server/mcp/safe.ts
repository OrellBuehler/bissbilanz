import { ResultValidationError } from '$lib/server/errors';

export type McpResult = {
	content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[];
	structuredContent?: Record<string, unknown>;
	isError?: true;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const asText = (payload: unknown): McpResult => {
	const text = JSON.stringify(payload, null, 2);
	if (!isPlainObject(payload)) return { content: [{ type: 'text' as const, text }] };
	// Round-trip through JSON so structuredContent matches the text block exactly
	// (Dates become ISO strings, undefined keys disappear).
	const structuredContent = JSON.parse(text) as Record<string, unknown>;
	return {
		content: [{ type: 'text' as const, text }],
		structuredContent,
		...(typeof structuredContent.error === 'string' ? { isError: true as const } : {})
	};
};

export const safe = <T extends unknown[], R>(fn: (...args: T) => Promise<R>) => {
	return async (...args: T): Promise<McpResult> => {
		try {
			return asText(await fn(...args));
		} catch (e) {
			if (e instanceof ResultValidationError) {
				return {
					...asText({
						error: 'validation_failed',
						issues: e.zodError.issues.map((i) => ({
							path: i.path.join('.'),
							message: i.message
						}))
					}),
					isError: true
				};
			}
			return {
				...asText({ error: e instanceof Error ? e.message : 'Unexpected error' }),
				isError: true
			};
		}
	};
};
