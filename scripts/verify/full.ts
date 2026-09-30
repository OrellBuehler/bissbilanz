// `bun run verify`: mirrors CI Quality plus API staleness, without rewriting
// files (api:check only touches generated API artifacts, and only when stale).
import { ensureGenerated, report, runStep, type StepResult } from './lib';

const results: StepResult[] = [];

const boot = await runStep('paraglide compile + svelte-kit sync', [
	'bash',
	'-c',
	'bun run paraglide:compile && bunx svelte-kit sync'
]);
results.push(boot);
if (!boot.ok) process.exit(report(results));
await ensureGenerated();

console.log('running svelte-check, lint, prettier, constants and analytics in parallel...');
results.push(
	...(await Promise.all([
		runStep('svelte-check', ['bun', 'run', 'check:svelte']),
		runStep('lint', ['bun', 'run', 'lint']),
		runStep('prettier --check', ['bunx', 'prettier', '--check', '.']),
		runStep('constants:check', ['bun', 'run', 'constants:check']),
		runStep('analytics:check', ['bun', 'run', 'analytics:check'])
	]))
);

console.log('running unit tests...');
results.push(await runStep('unit tests', ['bun', '--bun', 'vitest', 'run']));

console.log('running api:check...');
results.push(await runStep('api:check', ['bun', 'run', 'api:check']));

process.exit(report(results));
