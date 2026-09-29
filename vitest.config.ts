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
			'.worktrees/**',
			'crawler/**',
			'tests/integration-db/**',
			'tests/e2e/**'
		],
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
			reportsDirectory: './coverage',
			thresholds: { lines: 67, statements: 66, functions: 56, branches: 62 },
			include: ['src/lib/**/*.ts', 'src/routes/api/**/*.ts', 'src/hooks*.ts'],
			exclude: [
				'src/lib/api/generated/**',
				'src/lib/paraglide/**',
				'src/**/*.d.ts',
				'src/**/*.test.ts'
			]
		},
		setupFiles: ['./tests/utils/dexie-preload.ts'],
		server: {
			deps: {
				inline: ['zod']
			}
		}
	}
});
