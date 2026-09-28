/**
 * Asserts that a route handler's actual Response matches what
 * src/lib/server/openapi.ts documents for that operation and status code.
 *
 * The spec documents response shapes, but nothing previously checked that
 * handlers actually return them. This closes that gap: call it with the
 * real Response from an API test, before anything else reads its body
 * (Response.clone() throws once the body stream has been disturbed).
 *
 *   const response = await GET(event);
 *   await expectResponseContract('GET', '/api/foods/{id}', response);
 *   const data = await response.json();
 *   ...
 *
 * Pass the path exactly as it appears as a key in apiPaths (the OpenAPI path
 * template, e.g. '/api/foods/{id}', not the concrete request URL).
 */

import type { ZodType } from 'zod';
import { apiPaths } from '../../src/lib/server/openapi';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type OpenApiResponse = {
	description?: string;
	content?: Record<string, { schema?: unknown }>;
};

type Operation = {
	operationId?: string;
	responses?: Record<string, OpenApiResponse>;
};

function isZodType(value: unknown): value is ZodType {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { safeParse?: unknown }).safeParse === 'function'
	);
}

export async function expectResponseContract(
	method: Method,
	path: string,
	response: Response
): Promise<void> {
	const label = `${method} ${path}`;
	const pathItem = (apiPaths as Record<string, Record<string, Operation>>)[path];
	if (!pathItem) {
		throw new Error(
			`expectResponseContract: "${path}" is not documented in src/lib/server/openapi.ts (checked ${label})`
		);
	}

	const operation = pathItem[method.toLowerCase()];
	if (!operation) {
		const documentedMethods = Object.keys(pathItem).join(', ') || '(none)';
		throw new Error(
			`expectResponseContract: ${label} is not documented (path "${path}" only documents: ${documentedMethods})`
		);
	}

	const status = String(response.status);
	const responseSpec = operation.responses?.[status];
	if (!responseSpec) {
		const documentedStatuses = Object.keys(operation.responses ?? {}).join(', ') || '(none)';
		throw new Error(
			`expectResponseContract: ${label} does not document status ${status} (documented statuses: ${documentedStatuses})`
		);
	}

	const content = responseSpec.content;
	if (!content) {
		// No body documented (e.g. 204 No Content) — the real response must
		// also have no body.
		const clone = response.clone();
		const text = await clone.text();
		if (text !== '') {
			throw new Error(
				`expectResponseContract: ${label} ${status} is documented with no content, but the response body was non-empty:\n${text}`
			);
		}
		return;
	}

	const jsonContent = content['application/json'];
	if (!jsonContent || !isZodType(jsonContent.schema)) {
		throw new Error(
			`expectResponseContract: ${label} ${status} has no application/json Zod schema documented`
		);
	}
	const schema = jsonContent.schema;

	let body: unknown;
	try {
		body = await response.clone().json();
	} catch (err) {
		throw new Error(
			`expectResponseContract: ${label} ${status}: response body is not valid JSON (${err instanceof Error ? err.message : String(err)})`
		);
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
			.join('\n');
		throw new Error(
			`expectResponseContract: ${label} ${status} response does not match the documented schema:\n${issues}\n\nReceived body:\n${JSON.stringify(body, null, 2)}`
		);
	}
}
