const startedAt = performance.now();

export type StepResult = { name: string; ok: boolean; ms: number; output: string };

export const repoRoot = (() => {
	const r = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel']);
	return r.stdout.toString().trim() || process.cwd();
})();

export const runStep = async (name: string, cmd: string[]): Promise<StepResult> => {
	const start = performance.now();
	const proc = Bun.spawn(cmd, {
		cwd: repoRoot,
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: '0' }
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	return { name, ok: code === 0, ms: performance.now() - start, output: out + err };
};

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export const report = (results: StepResult[], skipped: string[] = []): number => {
	for (const r of results.filter((r) => !r.ok)) {
		console.error(`\n--- ${r.name} (failed) ---`);
		console.error(r.output.trimEnd());
	}
	console.log('\nSummary');
	for (const r of results) {
		console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${secs(r.ms)})`);
	}
	for (const s of skipped) console.log(`  skip  ${s}`);
	const failed = results.filter((r) => !r.ok);
	const total = performance.now() - startedAt;
	console.log(
		failed.length
			? `\nverify failed: ${failed.map((r) => r.name).join(', ')}`
			: `\nverify passed (${results.length} steps, ${secs(total)} wall)`
	);
	return failed.length ? 1 : 0;
};

export const ensureGenerated = async (): Promise<StepResult | null> => {
	const { existsSync } = await import('node:fs');
	const needsParaglide = !existsSync(`${repoRoot}/src/lib/paraglide/messages.js`);
	const needsSync = !existsSync(`${repoRoot}/.svelte-kit/tsconfig.json`);
	if (!needsParaglide && !needsSync) return null;
	return runStep('bootstrap generated files', [
		'bash',
		'-c',
		'bun run paraglide:compile && bunx svelte-kit sync'
	]);
};
