export type Logger = (line: string) => void;

export const consoleLog: Logger = (line) => console.error(line);
export const silentLog: Logger = () => {};

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
	if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
	return `${s}s`;
}

export function formatRate(count: number, ms: number, unit: string, perSeconds: number): string {
	if (ms <= 0) return `0 ${unit}`;
	return `${((count / ms) * 1000 * perSeconds).toFixed(1)} ${unit}`;
}

export function createIntervalGate(intervalMs: number, now: () => number = Date.now) {
	let last = now();
	return () => {
		const t = now();
		if (t - last < intervalMs) return false;
		last = t;
		return true;
	};
}
