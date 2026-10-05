/**
 * Maps `source` through `fn` with up to `concurrency` calls in flight, yielding results in
 * source order. `fn` must not reject: a rejection surfaces only when its turn comes up.
 */
export async function* mapOrdered<T, R>(
	source: AsyncIterable<T>,
	fn: (item: T) => Promise<R>,
	concurrency: number
): AsyncIterable<R> {
	const pending: Promise<R>[] = [];
	for await (const item of source) {
		pending.push(fn(item));
		if (pending.length >= concurrency) yield await pending.shift()!;
	}
	while (pending.length > 0) yield await pending.shift()!;
}
