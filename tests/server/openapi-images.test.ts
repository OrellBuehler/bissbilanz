import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { generateSpec } from '$lib/server/openapi';

describe('/api/images/upload spec', () => {
	test('documents the field name the route actually reads', async () => {
		// The handler does formData.get('image'); a spec that says `file` makes
		// every generated client upload a body the route rejects with a 400.
		const route = await readFile('src/routes/api/images/upload/+server.ts', 'utf-8');
		expect(route).toContain("formData.get('image')");

		const spec = generateSpec() as unknown as {
			paths: Record<
				string,
				{
					post: {
						requestBody: {
							content: {
								'multipart/form-data': {
									schema: { properties: Record<string, unknown>; required: string[] };
								};
							};
						};
					};
				}
			>;
		};
		const schema =
			spec.paths['/api/images/upload'].post.requestBody.content['multipart/form-data'].schema;
		expect(Object.keys(schema.properties)).toEqual(['image']);
		expect(schema.required).toEqual(['image']);
	});
});
