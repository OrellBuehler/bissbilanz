import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let resolved: { address: string; family: number }[] = [{ address: '203.0.113.10', family: 4 }];
const byHost: Record<string, { address: string; family: number }[]> = {};
const lookups: string[] = [];
vi.mock('node:dns/promises', () => ({
	lookup: async (hostname: string) => {
		lookups.push(hostname);
		if (hostname === 'nxdomain.example') throw new Error('ENOTFOUND');
		return byHost[hostname] ?? resolved;
	}
}));

vi.mock('$lib/server/images', () => ({
	MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
	processImageBytes: vi.fn(async () => '/uploads/11111111-1111-4111-8111-111111111111.webp'),
	unlinkUpload: vi.fn(async () => {})
}));

const { downloadImage, importImageFromUrl, sniffImageType, IMAGE_DOWNLOAD_MAX_REDIRECTS } =
	await import('$lib/server/image-download');
const images = await import('$lib/server/images');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);

type PinnedInit = RequestInit & { headers: Record<string, string>; tls: { serverName: string } };

const image = (bytes: Uint8Array, type = 'image/png', extra: Record<string, string> = {}) =>
	new Response(bytes as unknown as BodyInit, {
		status: 200,
		headers: { 'content-type': type, ...extra }
	});
const redirect = (location: string, status = 302) =>
	new Response(null, { status, headers: { location } });

let fetchMock: ReturnType<typeof vi.fn>;

const respondWith = (...responses: Response[]) => {
	fetchMock = vi.fn(async () => {
		const next = responses.shift();
		if (!next) throw new Error('unexpected extra request');
		return next;
	});
	vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => {
	resolved = [{ address: '203.0.113.10', family: 4 }];
	lookups.length = 0;
	for (const key of Object.keys(byHost)) delete byHost[key];
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('sniffImageType', () => {
	test.each([
		['png', PNG],
		['jpeg', JPEG],
		['webp', WEBP],
		['gif', GIF]
	] as const)('detects %s', (name, bytes) => {
		expect(sniffImageType(bytes)).toBe(name);
	});

	test.each([
		['html', new TextEncoder().encode('<html><script>')],
		['svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')],
		['empty', new Uint8Array()],
		[
			'riff but not webp',
			new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
		]
	])('rejects %s', (_name, bytes) => {
		expect(sniffImageType(bytes)).toBeNull();
	});
});

describe('downloadImage: what is fetched', () => {
	test('downloads an image and pins the connection to the vetted address', async () => {
		respondWith(image(PNG));
		const bytes = await downloadImage('https://cdn.example.com/steps/1.png?w=800');
		expect([...bytes]).toEqual([...PNG]);

		expect(lookups).toEqual(['cdn.example.com']);
		const [target, init] = fetchMock.mock.calls[0] as [URL, PinnedInit];
		expect(String(target)).toBe('https://203.0.113.10/steps/1.png?w=800');
		expect(init.headers.Host).toBe('cdn.example.com');
		expect(init.tls.serverName).toBe('cdn.example.com');
		expect(init.redirect).toBe('manual');
	});

	test('brackets an IPv6 address when pinning', async () => {
		resolved = [{ address: '2606:4700::1111', family: 6 }];
		respondWith(image(PNG));
		await downloadImage('https://cdn.example.com/a.png');
		expect(String((fetchMock.mock.calls[0] as [URL])[0])).toBe('https://[2606:4700::1111]/a.png');
	});

	test('falls through to the next vetted address when one refuses the connection', async () => {
		resolved = [
			{ address: '203.0.113.10', family: 4 },
			{ address: '203.0.113.11', family: 4 }
		];
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: URL) => {
				calls.push(url.hostname);
				if (calls.length === 1) throw new Error('ECONNREFUSED');
				return image(JPEG, 'image/jpeg');
			})
		);
		await downloadImage('https://cdn.example.com/a.jpg');
		expect(calls).toEqual(['203.0.113.10', '203.0.113.11']);
	});

	test.each([
		['image/jpeg', JPEG],
		['image/jpg', JPEG],
		['image/webp', WEBP],
		['image/gif', GIF],
		['IMAGE/PNG; charset=binary', PNG]
	])('accepts Content-Type %s', async (type, bytes) => {
		respondWith(image(bytes, type));
		await expect(downloadImage('https://cdn.example.com/a')).resolves.toBeDefined();
	});
});

describe('downloadImage: URL rules', () => {
	test.each([
		['http://cdn.example.com/a.png', /Only https/],
		['ftp://cdn.example.com/a.png', /Only https/],
		['data:image/png;base64,AAAA', /Only https/],
		['not a url', /not a valid URL/],
		['https://user:pass@cdn.example.com/a.png', /credentials/],
		['https://cdn.example.com:8443/a.png', /default https port/],
		['https://127.0.0.1/a.png', /public host name/],
		['https://[::1]/a.png', /public host name/],
		['https://2130706433/a.png', /public host name/],
		['https://localhost/a.png', /public host name/],
		['https://admin.localhost/a.png', /public host name/]
	])('rejects %s before any network access', async (url, message) => {
		vi.stubGlobal('fetch', vi.fn());
		await expect(downloadImage(url)).rejects.toThrow(message);
		expect(lookups).toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([
		'10.0.0.5',
		'127.0.0.1',
		'169.254.169.254',
		'192.168.1.10',
		'172.16.4.4',
		'100.64.0.1',
		'192.0.0.192',
		'::1',
		'fd00::1',
		'fe80::1',
		'::ffff:127.0.0.1',
		'::ffff:7f00:1',
		'64:ff9b::7f00:1'
	])('refuses a host that resolves to %s', async (address) => {
		resolved = [{ address, family: address.includes(':') ? 6 : 4 }];
		vi.stubGlobal('fetch', vi.fn());
		await expect(downloadImage('https://rebind.example.com/a.png')).rejects.toThrow(
			/does not resolve to a public address/
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('refuses a host when any of its addresses is private', async () => {
		resolved = [
			{ address: '203.0.113.10', family: 4 },
			{ address: '10.0.0.1', family: 4 }
		];
		vi.stubGlobal('fetch', vi.fn());
		await expect(downloadImage('https://mixed.example.com/a.png')).rejects.toThrow(
			/public address/
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('reports an unresolvable host', async () => {
		vi.stubGlobal('fetch', vi.fn());
		await expect(downloadImage('https://nxdomain.example/a.png')).rejects.toThrow(
			/Could not resolve nxdomain.example/
		);
	});
});

describe('downloadImage: redirects', () => {
	test('follows a redirect and re-validates the new host', async () => {
		respondWith(redirect('https://images.example.org/final.png'), image(PNG));
		await downloadImage('https://short.example.com/x');
		expect(lookups).toEqual(['short.example.com', 'images.example.org']);
		expect(String((fetchMock.mock.calls[1] as [URL])[0])).toBe('https://203.0.113.10/final.png');
		expect((fetchMock.mock.calls[1] as [URL, PinnedInit])[1].headers.Host).toBe(
			'images.example.org'
		);
	});

	test('resolves a relative redirect against the current URL', async () => {
		respondWith(redirect('/moved/a.png', 301), image(PNG));
		await downloadImage('https://cdn.example.com/a.png');
		expect(String((fetchMock.mock.calls[1] as [URL])[0])).toBe('https://203.0.113.10/moved/a.png');
	});

	test.each([
		['a downgrade to http', 'http://cdn.example.com/a.png', /Only https/],
		['a loopback IP literal', 'https://127.0.0.1/a.png', /public host name/],
		['the metadata service', 'https://169.254.169.254/latest/meta-data', /public host name/],
		['localhost', 'https://localhost/a.png', /public host name/]
	])('rejects a redirect to %s', async (_name, location, message) => {
		respondWith(redirect(location));
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(message);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('rejects a redirect to a host that resolves privately', async () => {
		byHost['internal.example.com'] = [{ address: '10.1.1.1', family: 4 }];
		respondWith(redirect('https://internal.example.com/a.png'));
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(/public address/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test(`stops after ${IMAGE_DOWNLOAD_MAX_REDIRECTS} redirects`, async () => {
		respondWith(
			redirect('https://a.example.com/1'),
			redirect('https://b.example.com/2'),
			redirect('https://c.example.com/3'),
			redirect('https://d.example.com/4')
		);
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(
			/Too many redirects/
		);
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	test(`allows exactly ${IMAGE_DOWNLOAD_MAX_REDIRECTS} redirects`, async () => {
		respondWith(
			redirect('https://a.example.com/1'),
			redirect('https://b.example.com/2'),
			redirect('https://c.example.com/3'),
			image(PNG)
		);
		await expect(downloadImage('https://cdn.example.com/a.png')).resolves.toBeDefined();
	});

	test('rejects a redirect without a Location', async () => {
		respondWith(new Response(null, { status: 302 }));
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(
			/redirect without a target/
		);
	});
});

describe('downloadImage: response validation', () => {
	test('reports an HTTP error status', async () => {
		respondWith(new Response('nope', { status: 404 }));
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(/HTTP 404/);
	});

	test.each([
		['text/html', new TextEncoder().encode('<html>')],
		['image/svg+xml', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')],
		['application/octet-stream', PNG]
	])('rejects Content-Type %s', async (type, bytes) => {
		respondWith(image(bytes, type));
		await expect(downloadImage('https://cdn.example.com/a')).rejects.toThrow(
			/Not a supported image/
		);
	});

	test('rejects a missing Content-Type', async () => {
		respondWith(new Response(PNG, { status: 200 }));
		await expect(downloadImage('https://cdn.example.com/a')).rejects.toThrow(/missing/);
	});

	test('rejects bytes that are not an image even when the header says so', async () => {
		respondWith(image(new TextEncoder().encode('<html>gotcha</html>'), 'image/png'));
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(
			/not a JPEG, PNG, WebP or GIF/
		);
	});

	test('rejects a declared size over the limit without reading the body', async () => {
		respondWith(image(PNG, 'image/png', { 'content-length': String(11 * 1024 * 1024) }));
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(
			/larger than 10MB/
		);
	});

	test('rejects a streamed body that grows past the limit', async () => {
		const chunk = new Uint8Array(4 * 1024);
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				sent += chunk.length;
				controller.enqueue(chunk);
			}
		});
		respondWith(new Response(body, { status: 200, headers: { 'content-type': 'image/png' } }));
		await expect(downloadImage('https://cdn.example.com/a.png', 16 * 1024)).rejects.toThrow(
			/larger than/
		);
		expect(sent).toBeLessThan(64 * 1024);
	});

	test('reports a network failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('socket hang up');
			})
		);
		await expect(downloadImage('https://cdn.example.com/a.png')).rejects.toThrow(
			/Could not download the image: socket hang up/
		);
	});

	test('times out a server that never answers', async () => {
		const controller = new AbortController();
		const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: URL, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
					})
			)
		);
		try {
			const result = downloadImage('https://cdn.example.com/slow.png');
			const assertion = expect(result).rejects.toThrow(/timed out after 15s/);
			await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
			controller.abort();
			await assertion;
			expect(timeout).toHaveBeenCalledWith(15_000);
		} finally {
			timeout.mockRestore();
		}
	});
});

describe('importImageFromUrl', () => {
	test('stores the download through the normal upload processing', async () => {
		respondWith(image(PNG));
		const url = await importImageFromUrl('https://cdn.example.com/a.png', 'user-1', {
			maxDim: 1280,
			fit: 'inside'
		});
		expect(url).toBe('/uploads/11111111-1111-4111-8111-111111111111.webp');
		expect(images.processImageBytes).toHaveBeenCalledWith(expect.any(Uint8Array), 'user-1', {
			maxDim: 1280,
			fit: 'inside'
		});
	});

	test('stores nothing when the download fails', async () => {
		vi.mocked(images.processImageBytes).mockClear();
		respondWith(new Response('x', { status: 500 }));
		await expect(importImageFromUrl('https://cdn.example.com/a.png', 'user-1')).rejects.toThrow();
		expect(images.processImageBytes).not.toHaveBeenCalled();
	});
});
