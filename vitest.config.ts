import { defineConfig, configDefaults } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

const lucideStub = path.resolve(__dirname, 'tests/helpers/__mocks__/lucide-stub.ts');

export default defineConfig({
	plugins: [svelte({ compilerOptions: { hmr: false } })],
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
		exclude: [
			...configDefaults.exclude,
			'.claude/**',
			'crawler/**',
			'tests/integration-db/**',
			'tests/e2e/**'
		],
		setupFiles: ['./tests/utils/dexie-preload.ts'],
		server: {
			deps: {
				inline: ['zod']
			}
		}
	}
});
