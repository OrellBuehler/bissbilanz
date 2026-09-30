// `bun run verify:changed [--base]`: fast, non-interactive check of what changed.
// Staged + unstaged + untracked files vs HEAD, or vs the merge-base with
// origin/main with --base. Safe to run from a hook: no prompts, and nothing is
// rewritten except the generated API artifacts when api:check finds them stale.
import { existsSync } from 'node:fs';
import { ensureGenerated, repoRoot, report, runStep, type StepResult } from './lib';

const git = (...args: string[]) => {
	const r = Bun.spawnSync(['git', ...args], { cwd: repoRoot });
	return r.exitCode === 0 ? r.stdout.toString().trim() : '';
};

let ref = 'HEAD';
if (process.argv.includes('--base')) {
	ref = git('merge-base', 'HEAD', 'origin/main') || git('merge-base', 'HEAD', 'main') || 'HEAD';
}

const changed = [
	...new Set(
		[
			...git('diff', '--name-only', '--diff-filter=d', ref).split('\n'),
			...git('ls-files', '--others', '--exclude-standard').split('\n')
		].filter((f) => f && existsSync(`${repoRoot}/${f}`))
	)
];

const external = (f: string) => f.startsWith('mobile/') || f.startsWith('crawler/');
const codeRe = /\.(ts|js|mjs|cjs|svelte)$/;
const code = changed.filter((f) => codeRe.test(f) && !external(f));
const tsSvelte = code.filter((f) => /\.(ts|svelte)$/.test(f));
const testable = code.filter((f) => /^(src|tests)\//.test(f));
const apiTouched = changed.some(
	(f) => f.startsWith('src/lib/server/validation/') || f.startsWith('src/routes/api/')
);

if (changed.length === 0) {
	console.log('verify:changed: no changes');
	process.exit(0);
}

if (!existsSync(`${repoRoot}/node_modules`)) {
	console.error('verify:changed: node_modules missing, run `bun install --frozen-lockfile`');
	process.exit(1);
}

const results: StepResult[] = [];
const skipped: string[] = [];

if (tsSvelte.length > 0 || testable.length > 0) {
	const boot = await ensureGenerated();
	if (boot) {
		results.push(boot);
		if (!boot.ok) process.exit(report(results));
	}
}

const jobs: Promise<StepResult>[] = [
	runStep('prettier --check', ['bunx', 'prettier', '--check', '--ignore-unknown', ...changed])
];

if (code.length > 0) {
	jobs.push(runStep('eslint', ['bunx', 'eslint', '--no-warn-ignored', ...code]));
} else skipped.push('eslint (no ts/js/svelte changes)');

if (testable.length > 0) {
	jobs.push(
		runStep('vitest related', [
			'bun',
			'--bun',
			'vitest',
			'related',
			'--run',
			'--passWithNoTests',
			...testable
		])
	);
} else skipped.push('vitest related (no src/tests changes)');

if (tsSvelte.length > 0) {
	jobs.push(runStep('svelte-check', ['bun', 'run', 'check:svelte']));
} else skipped.push('svelte-check (no ts/svelte changes)');

results.push(...(await Promise.all(jobs)));

if (apiTouched) {
	results.push(await runStep('api:check', ['bun', 'run', 'api:check']));
} else skipped.push('api:check (no validation/ or routes/api changes)');

process.exit(report(results, skipped));
