import { test, expect } from 'bun:test';
import { splitJsonlLines } from './jsonl-stream';

async function* chunks(parts: string[]) {
	for (const p of parts) yield new TextEncoder().encode(p);
}

test('splits a byte stream into lines across chunk boundaries, skipping blanks', async () => {
	const out: string[] = [];
	for await (const line of splitJsonlLines(chunks(['{"a":1}\n{"b":', '2}\n\n{"c":3}'])))
		out.push(line);
	expect(out).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
});
