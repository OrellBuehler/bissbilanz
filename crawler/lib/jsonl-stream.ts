export async function* splitJsonlLines(source: AsyncIterable<Uint8Array>): AsyncIterable<string> {
	const decoder = new TextDecoder();
	let buf = '';
	for await (const chunk of source) {
		buf += decoder.decode(chunk, { stream: true });
		let nl: number;
		while ((nl = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (line.length > 0) yield line;
		}
	}
	buf += decoder.decode(); // flush any buffered bytes from an incomplete trailing sequence
	const last = buf.trim();
	if (last.length > 0) yield last;
}

export async function* readDumpLines(path: string): AsyncIterable<string> {
	const file = Bun.file(path);
	let stream: ReadableStream<Uint8Array> = file.stream();
	if (path.endsWith('.gz')) {
		stream = stream.pipeThrough(
			new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
		);
	}
	yield* splitJsonlLines(stream as unknown as AsyncIterable<Uint8Array>);
}
