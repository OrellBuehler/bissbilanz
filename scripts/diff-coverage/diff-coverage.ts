/**
 * Fails when the lines a PR changed in src/lib/**\/*.ts and src/routes/api/**\/*.ts
 * are covered less than the threshold by the unit tests.
 *
 *   bun run test:coverage && bun run test:coverage:diff [--base origin/main] [--threshold 80]
 *
 * The include/exclude globs mirror coverage.include/exclude in vitest.config.ts.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export type LcovFile = { path: string; lines: Map<number, number> };
export type ChangedLines = Map<string, number[]>;
export type DiffCoverage = {
	files: { path: string; covered: number[]; uncovered: number[] }[];
	covered: number;
	total: number;
	pct: number | null;
};

const INCLUDE = [/^src\/lib\/.+\.ts$/, /^src\/routes\/api\/.+\.ts$/];
const EXCLUDE = [
	/^src\/lib\/api\/generated\//,
	/^src\/lib\/paraglide\//,
	/\.d\.ts$/,
	/\.test\.ts$/
];

export function isTrackedFile(path: string): boolean {
	return INCLUDE.some((re) => re.test(path)) && !EXCLUDE.some((re) => re.test(path));
}

export function parseLcov(text: string, root = ''): LcovFile[] {
	const files: LcovFile[] = [];
	let current: LcovFile | null = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('SF:')) {
			let path = line.slice(3).replace(/\\/g, '/');
			if (root && path.startsWith(root + '/')) path = path.slice(root.length + 1);
			current = { path, lines: new Map() };
		} else if (line.startsWith('DA:') && current) {
			const [no, hits] = line.slice(3).split(',');
			const n = Number(no);
			const h = Number(hits);
			if (Number.isFinite(n) && Number.isFinite(h)) {
				current.lines.set(n, Math.max(h, current.lines.get(n) ?? 0));
			}
		} else if (line === 'end_of_record' && current) {
			files.push(current);
			current = null;
		}
	}
	return files;
}

export function parseUnifiedDiff(diff: string): ChangedLines {
	const changed: ChangedLines = new Map();
	let file: string | null = null;
	let next = 0;
	for (const line of diff.split(/\r?\n/)) {
		if (line.startsWith('+++ ')) {
			const target = line.slice(4).trim();
			file = target === '/dev/null' ? null : target.replace(/^b\//, '');
			continue;
		}
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			next = Number(hunk[1]);
			continue;
		}
		if (!file) continue;
		if (line.startsWith('+') && !line.startsWith('+++')) {
			const list = changed.get(file) ?? [];
			list.push(next++);
			changed.set(file, list);
		} else if (line.startsWith(' ')) {
			next++;
		}
	}
	return changed;
}

export function computeDiffCoverage(changed: ChangedLines, lcov: LcovFile[]): DiffCoverage {
	const byPath = new Map(lcov.map((f) => [f.path, f]));
	const files: DiffCoverage['files'] = [];
	let covered = 0;
	let total = 0;
	for (const [path, lines] of changed) {
		if (!isTrackedFile(path)) continue;
		const record = byPath.get(path);
		const hit: number[] = [];
		const miss: number[] = [];
		for (const n of lines) {
			const hits = record?.lines.get(n);
			if (hits === undefined) {
				// A file absent from lcov was never loaded by any test; a line that
				// lcov skips inside a known file (comment, brace) is not executable.
				if (!record) miss.push(n);
				continue;
			}
			(hits > 0 ? hit : miss).push(n);
		}
		if (hit.length + miss.length === 0) continue;
		files.push({ path, covered: hit, uncovered: miss });
		covered += hit.length;
		total += hit.length + miss.length;
	}
	return { files, covered, total, pct: total === 0 ? null : (covered / total) * 100 };
}

export function formatRanges(lines: number[]): string {
	const sorted = [...lines].sort((a, b) => a - b);
	const out: string[] = [];
	for (let i = 0; i < sorted.length;) {
		let j = i;
		while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
		out.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
		i = j + 1;
	}
	return out.join(', ');
}

export function renderSummary(result: DiffCoverage, threshold: number): string {
	if (result.total === 0) {
		return '## Diff coverage\n\nNo changed executable lines in tracked source files.\n';
	}
	const pct = result.pct!.toFixed(1);
	const verdict = result.pct! >= threshold ? 'passed' : 'FAILED';
	const rows = result.files
		.filter((f) => f.uncovered.length > 0)
		.map((f) => `| \`${f.path}\` | ${formatRanges(f.uncovered)} |`);
	const lines = [
		'## Diff coverage',
		'',
		`${verdict}: ${pct}% of ${result.total} changed lines covered (threshold ${threshold}%).`
	];
	if (rows.length > 0) {
		lines.push('', '| file | uncovered changed lines |', '| --- | --- |', ...rows);
	}
	return lines.join('\n') + '\n';
}

function git(args: string[]): string {
	const res = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
	return res.stdout;
}

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main() {
	const base = arg(
		'--base',
		process.env.BASE_REF ? `origin/${process.env.BASE_REF}` : 'origin/main'
	);
	const threshold = Number(arg('--threshold', '80'));
	const lcovPath = arg('--lcov', 'coverage/lcov.info');

	const mergeBase = git(['merge-base', base, 'HEAD']).trim();
	const diff = git(['diff', '--unified=0', '--no-color', mergeBase, 'HEAD', '--', 'src']);
	const changed = parseUnifiedDiff(diff);
	const relevant = [...changed.keys()].some(isTrackedFile);

	let summary: string;
	let failed = false;
	if (!relevant) {
		summary = renderSummary({ files: [], covered: 0, total: 0, pct: null }, threshold);
	} else {
		if (!existsSync(lcovPath)) {
			console.error(`${lcovPath} not found; run bun run test:coverage first`);
			process.exit(2);
		}
		const lcov = parseLcov(readFileSync(lcovPath, 'utf8'), resolve('.').replace(/\\/g, '/'));
		const result = computeDiffCoverage(changed, lcov);
		summary = renderSummary(result, threshold);
		failed = result.pct !== null && result.pct < threshold;
	}

	console.log(summary);
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
	}
	if (failed) process.exit(1);
}

if (import.meta.main) main();
