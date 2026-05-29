export async function readCheckpoint<T = unknown>(path: string): Promise<T | null> {
	const f = Bun.file(path);
	if (!(await f.exists())) return null;
	try {
		return JSON.parse(await f.text()) as T;
	} catch {
		return null;
	}
}

export async function writeCheckpoint(path: string, value: unknown): Promise<void> {
	await Bun.write(path, JSON.stringify(value));
}
