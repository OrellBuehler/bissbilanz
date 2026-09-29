import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { MAX_UPLOAD_BYTES, processImageBytes, unlinkUpload } from './images';
import { isPublicIp } from './public-ip';

export const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;
export const IMAGE_DOWNLOAD_MAX_REDIRECTS = 3;

/** A download failed; the message is meant to be shown to the caller. */
export class ImageDownloadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImageDownloadError';
	}
}

type Address = { address: string; family: number };

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

/** Type of an image by its leading bytes; the Content-Type header is never trusted alone. */
export const sniffImageType = (bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | 'gif' | null => {
	const startsWith = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte);
	if (startsWith(0xff, 0xd8, 0xff)) return 'jpeg';
	if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
	if (startsWith(0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39)) return 'gif';
	if (
		startsWith(0x52, 0x49, 0x46, 0x46) &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'webp';
	}
	return null;
};

/** https on the default port, a real host name (never an IP literal), no credentials. */
const parseTarget = (raw: string): URL => {
	if (!URL.canParse(raw)) throw new ImageDownloadError(`"${raw}" is not a valid URL`);
	const url = new URL(raw);
	if (url.protocol !== 'https:') {
		throw new ImageDownloadError(`Only https image links are supported (got ${url.protocol}//)`);
	}
	if (url.username || url.password) {
		throw new ImageDownloadError('Image links must not contain credentials');
	}
	if (url.port && url.port !== '443') {
		throw new ImageDownloadError('Image links must use the default https port');
	}
	const host = url.hostname.toLowerCase();
	if (
		isIP(host.replace(/^\[|\]$/g, '')) !== 0 ||
		host === 'localhost' ||
		host.endsWith('.localhost')
	) {
		throw new ImageDownloadError('Image links must use a public host name');
	}
	return url;
};

/**
 * Resolve the host once and refuse it unless every address is public, so the
 * download cannot probe the server's own network. The vetted addresses are
 * dialed directly, so the name is never resolved a second time (DNS rebinding).
 */
const resolvePublicAddresses = async (hostname: string): Promise<Address[]> => {
	let addresses: Address[];
	try {
		addresses = await lookup(hostname, { all: true, verbatim: true });
	} catch {
		throw new ImageDownloadError(`Could not resolve ${hostname}`);
	}
	if (addresses.length === 0 || !addresses.every(({ address }) => isPublicIp(address))) {
		throw new ImageDownloadError(`${hostname} does not resolve to a public address`);
	}
	return addresses;
};

/**
 * One request to one pre-validated address: the URL carries the IP, while the
 * Host header and TLS server name keep the original host for virtual hosting and
 * certificate checks. `redirect: 'manual'` keeps a redirect from escaping the
 * pin; the caller re-validates every hop.
 */
const fetchPinned = (target: URL, { address, family }: Address, signal: AbortSignal) => {
	const pinned = new URL(target);
	pinned.hostname = family === 6 ? `[${address}]` : address;
	// `tls` and `proxy` are Bun extensions to RequestInit that the project's
	// tsconfig (no bun-types) does not know about.
	const init: RequestInit & { tls: { serverName: string }; proxy: false } = {
		headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif', Host: target.host },
		tls: { serverName: target.hostname },
		proxy: false,
		redirect: 'manual',
		signal
	};
	return fetch(pinned, init);
};

const readCapped = async (response: Response, limit: number): Promise<Uint8Array> => {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > limit) {
		throw new ImageDownloadError(`Image is larger than ${limit / 1024 / 1024}MB`);
	}
	if (!response.body) throw new ImageDownloadError('The image response had no body');
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel();
			throw new ImageDownloadError(`Image is larger than ${limit / 1024 / 1024}MB`);
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

/**
 * Download an image from a public https URL.
 *
 * Only https on port 443 to a host that resolves exclusively to public
 * addresses; at most {@link IMAGE_DOWNLOAD_MAX_REDIRECTS} redirects, each one
 * re-validated; one deadline for the whole download; a size cap equal to the
 * upload limit; and the bytes must be a JPEG, PNG, WebP or GIF by both the
 * Content-Type header and their magic bytes.
 */
export const downloadImage = async (
	rawUrl: string,
	maxBytes = MAX_UPLOAD_BYTES
): Promise<Uint8Array> => {
	const signal = AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS);
	let target = parseTarget(rawUrl);
	try {
		for (let hop = 0; ; hop++) {
			const addresses = await resolvePublicAddresses(target.hostname);
			let response: Response | undefined;
			let lastError: unknown;
			for (const candidate of addresses) {
				signal.throwIfAborted();
				try {
					response = await fetchPinned(target, candidate, signal);
					break;
				} catch (err) {
					lastError = err;
				}
			}
			if (!response) throw lastError;

			if (response.status >= 300 && response.status < 400) {
				await response.body?.cancel();
				const location = response.headers.get('location');
				if (!location)
					throw new ImageDownloadError(`${target.host} sent a redirect without a target`);
				if (hop >= IMAGE_DOWNLOAD_MAX_REDIRECTS) {
					throw new ImageDownloadError(
						`Too many redirects (more than ${IMAGE_DOWNLOAD_MAX_REDIRECTS})`
					);
				}
				target = parseTarget(new URL(location, target).href);
				continue;
			}
			if (!response.ok) {
				await response.body?.cancel();
				throw new ImageDownloadError(`${target.host} answered with HTTP ${response.status}`);
			}

			const contentType = (response.headers.get('content-type') ?? '')
				.split(';')[0]
				.trim()
				.toLowerCase();
			if (!ALLOWED_TYPES.has(contentType)) {
				await response.body?.cancel();
				throw new ImageDownloadError(
					`Not a supported image (Content-Type ${contentType || 'missing'}; use JPEG, PNG, WebP or GIF)`
				);
			}
			const bytes = await readCapped(response, maxBytes);
			if (!sniffImageType(bytes)) {
				throw new ImageDownloadError('The download is not a JPEG, PNG, WebP or GIF image');
			}
			return bytes;
		}
	} catch (err) {
		if (err instanceof ImageDownloadError) throw err;
		if (signal.aborted) {
			throw new ImageDownloadError(
				`Downloading the image timed out after ${IMAGE_DOWNLOAD_TIMEOUT_MS / 1000}s`
			);
		}
		throw new ImageDownloadError(
			`Could not download the image: ${err instanceof Error ? err.message : 'network error'}`
		);
	}
};

/**
 * Download `rawUrl` and store it exactly like an upload (re-encoded, metadata
 * stripped, recorded in `uploads` for the user). Returns the `/uploads/...` URL.
 */
export const importImageFromUrl = async (
	rawUrl: string,
	userId: string,
	opts?: { maxDim?: number; fit?: 'cover' | 'inside' }
): Promise<string> => processImageBytes(await downloadImage(rawUrl), userId, opts);

/** Remove images stored by {@link importImageFromUrl} when the call that wanted them fails. */
export const discardImportedImages = async (urls: string[], userId: string): Promise<void> => {
	await Promise.all(urls.map((url) => unlinkUpload(url, userId)));
};
