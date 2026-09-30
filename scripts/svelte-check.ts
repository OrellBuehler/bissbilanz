// Runs svelte-check (tsgo) and ratchets the warning count against
// scripts/svelte-check-baseline.json: errors always fail, warnings may not grow.
// Usage: bun run scripts/svelte-check.ts [--update]
import { readFileSync, writeFileSync } from 'node:fs';

const baselinePath = new URL('./svelte-check-baseline.json', import.meta.url);
const update = process.argv.includes('--update');

const proc = Bun.spawn(
	['bunx', 'svelte-check', '--tsconfig', './tsconfig.json', '--tsgo', '--output', 'machine'],
	{ stdout: 'pipe', stderr: 'inherit' }
);
const output = await new Response(proc.stdout).text();
await proc.exited;

const lines = output.split('\n');
const errors = lines.filter((l) => / ERROR /.test(l));
const warnings = lines.filter((l) => / WARNING /.test(l));
const completed = lines.some((l) => / COMPLETED /.test(l));

const show = (l: string) => l.replace(/^\d+ /, '');

if (!completed) {
	console.error(output);
	console.error('svelte-check did not complete');
	process.exit(1);
}

if (errors.length > 0) {
	errors.forEach((l) => console.error(show(l)));
	console.error(`svelte-check: ${errors.length} error(s)`);
	process.exit(1);
}

if (update) {
	writeFileSync(baselinePath, JSON.stringify({ warnings: warnings.length }, null, '\t') + '\n');
	console.log(`svelte-check: baseline set to ${warnings.length} warning(s)`);
	process.exit(0);
}

const baseline: number = JSON.parse(readFileSync(baselinePath, 'utf8')).warnings;

if (warnings.length > baseline) {
	warnings.forEach((l) => console.error(show(l)));
	console.error(
		`svelte-check: ${warnings.length} warnings, baseline is ${baseline}. Fix the new warnings; do not raise the baseline.`
	);
	process.exit(1);
}

if (warnings.length < baseline) {
	console.log(
		`svelte-check: ${warnings.length} warnings, baseline is ${baseline}. Lower it with: bun run check:update-baseline`
	);
} else {
	console.log(`svelte-check: 0 errors, ${warnings.length} warnings (at baseline)`);
}
