import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: [{ find: '$lib', replacement: path.resolve(__dirname, 'src/lib') }]
	},
	test: {
		include: ['tests/integration-db/**/*.test.ts'],
		exclude: ['**/node_modules/**'],
		globalSetup: ['tests/integration-db/setup.ts'],
		testTimeout: 60000,
		hookTimeout: 120000
	}
});
