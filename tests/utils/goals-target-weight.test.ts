import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const GOALS_PAGE = join(SRC_DIR, 'routes/(app)/goals/+page.svelte');

function collectSvelteFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const fullPath = join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			results.push(...collectSvelteFiles(fullPath));
			continue;
		}
		if (entry.endsWith('.svelte')) {
			results.push(fullPath);
		}
	}
	return results;
}

describe('goals target weight input', () => {
	const source = readFileSync(GOALS_PAGE, 'utf8');
	const targetWeightInput = source.match(/<Input\b[^>]*id="target-weight"[^>]*>/s)?.[0] ?? '';

	test('is a decimal text field, not a number input', () => {
		expect(targetWeightInput).not.toBe('');
		// `bind:value` on a number input hands back a number|null, which made
		// `targetWeight.trim()` throw (Sentry BISSBILANZ-3J / BISSBILANZ-3K).
		expect(targetWeightInput).not.toContain('type="number"');
		expect(targetWeightInput).toContain('type="text"');
		expect(targetWeightInput).toContain('inputmode="decimal"');
	});

	test('string methods run on the coerced text, never on the bound state', () => {
		expect(source).not.toMatch(/\btargetWeight\.\w+\(/);
	});
});

describe('number inputs bound to string state', () => {
	const STRING_METHODS = ['trim', 'toLowerCase', 'toUpperCase', 'startsWith', 'padStart', 'split'];

	test('no `type="number"` input is bound to a value used as a string', () => {
		const offenders: string[] = [];

		for (const file of collectSvelteFiles(SRC_DIR)) {
			const source = readFileSync(file, 'utf8');
			for (const tag of source.match(/<[Ii]nput\b[^>]*>/gs) ?? []) {
				if (!tag.includes('type="number"')) continue;
				const bound = tag.match(/bind:value=\{([A-Za-z_$][\w$]*)\}/)?.[1];
				if (!bound) continue;
				const usedAsString = STRING_METHODS.some((method) =>
					new RegExp(`\\b${bound}\\.${method}\\(`).test(source)
				);
				if (usedAsString) {
					offenders.push(`${file.replace(`${process.cwd()}/`, '')}: ${bound}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
