import { defineConfig } from 'vitest/config';
import path from 'path';

const lucideStub = path.resolve(__dirname, 'tests/helpers/__mocks__/lucide-stub.ts');

export default defineConfig({
	resolve: {
		alias: [
			{ find: '$lib', replacement: path.resolve(__dirname, 'src/lib') },
			{
				find: '$app/environment',
				replacement: path.resolve(__dirname, 'tests/helpers/__mocks__/app-environment.ts')
			},
			{ find: /^@lucide\/svelte\/icons\/.*/, replacement: lucideStub }
		]
	},
	test: {
		exclude: ['**/node_modules/**', '.claude/**', 'tests/integration-db/**'],
		setupFiles: ['./tests/utils/dexie-preload.ts'],
		server: {
			deps: {
				inline: ['zod']
			}
		}
	}
});
