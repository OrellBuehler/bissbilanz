/** Postgres caps a statement at 65535 parameters, and `foods` is ~60 columns wide. */
export const CHUNK_SIZE = 500;

/** Run a write for each slice of `rows`, keeping every statement under the parameter cap. */
export async function inChunks<T>(
	rows: T[],
	run: (part: T[]) => Promise<unknown>,
	size = CHUNK_SIZE
): Promise<void> {
	for (let index = 0; index < rows.length; index += size) {
		await run(rows.slice(index, index + size));
	}
}

/** Run a lookup for each slice of `values` (e.g. an `IN (...)` list) and concatenate the results. */
export async function collect<T, R>(values: T[], run: (part: T[]) => Promise<R[]>): Promise<R[]> {
	const results: R[] = [];
	for (let index = 0; index < values.length; index += 1000) {
		results.push(...(await run(values.slice(index, index + 1000))));
	}
	return results;
}
