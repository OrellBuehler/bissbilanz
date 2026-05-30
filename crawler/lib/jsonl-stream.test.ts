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

test('decodes a multi-byte UTF-8 char split across chunk boundaries', async () => {
	// "ü" (U+00FC) encodes to bytes 0xC3 0xBC; split the stream between those two bytes.
	const bytes = new TextEncoder().encode('{"n":"Grün"}\n');
	async function* src() {
		yield bytes.slice(0, 9); // ends on the first byte of "ü"
		yield bytes.slice(9);
	}
	const out: string[] = [];
	for await (const line of splitJsonlLines(src())) out.push(line);
	expect(out).toEqual(['{"n":"Grün"}']);
});
