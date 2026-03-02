import { defineConfig } from 'vitest/config';
import path from 'path';

const lucideStub = path.resolve(__dirname, 'tests/helpers/__mocks__/lucide-stub.ts');

export default defineConfig({
	resolve: {
		alias: [
			{ find: '$lib', replacement: path.resolve(__dirname, 'src/lib') },
			{ find: /^@lucide\/svelte\/icons\/.*/, replacement: lucideStub }
		]
	},
	test: {
		setupFiles: ['./tests/utils/dexie-preload.ts'],
		server: {
			deps: {
				inline: ['zod']
			}
		}
	}
});
