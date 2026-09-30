import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
	{
		ignores: [
			'.svelte-kit/**',
			'build/**',
			'node_modules/**',
			'coverage/**',
			'drizzle/**',
			'src/lib/paraglide/**',
			'src/paraglide/**',
			'src/lib/api/generated/**',
			'mobile/**',
			'crawler/**',
			'.claude/**',
			'.worktrees/**',
			'static/**',
			'store/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		}
	},
	{
		linterOptions: { reportUnusedDisableDirectives: 'off' },
		rules: {
			// stylistic or too noisy to be high-signal
			'@typescript-eslint/no-explicit-any': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/no-useless-children-snippet': 'off',
			'svelte/no-useless-mustaches': 'off',
			'no-irregular-whitespace': 'off',
			'no-useless-escape': 'off',
			'prefer-const': 'off',
			'preserve-caught-error': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			]
		}
	},
	{
		// Type-aware rules only where the SvelteKit tsconfig has a project; the
		// scripts/ and root config files are linted without type information.
		files: ['src/**/*.{ts,js,svelte}', 'tests/**/*.{ts,js,svelte}'],
		ignores: ['src/routes/.well-known/**'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/await-thenable': 'error'
		}
	}
);
