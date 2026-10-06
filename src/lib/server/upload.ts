import { ApiError } from './errors';

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Parse a multipart body without buffering more than `maxBytes` (plus multipart
 * framing). The global body limit is far larger than any single upload route
 * allows, so without this a client can make the server hold ~100MB before the
 * route's own size check runs. A declared Content-Length over the cap is rejected
 * up front; chunked bodies are counted as they stream in and aborted at the cap.
 */
export async function readCappedFormData(
	request: Request,
	maxBytes: number,
	onTooLarge?: () => ApiError
): Promise<FormData> {
	const limit = maxBytes + MULTIPART_OVERHEAD_BYTES;
	const tooLarge =
		onTooLarge ??
		(() => new ApiError(400, `File must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller`));

	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > limit) throw tooLarge();
	if (!request.body) throw new ApiError(400, 'Expected a multipart/form-data upload');

	let received = 0;
	let exceeded = false;
	const counter = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength;
			if (received > limit) {
				exceeded = true;
				controller.error(tooLarge());
				return;
			}
			controller.enqueue(chunk);
		}
	});

	try {
		return await new Response(request.body.pipeThrough(counter), {
			headers: { 'content-type': request.headers.get('content-type') ?? '' }
		}).formData();
	} catch (error) {
		if (exceeded) throw tooLarge();
		throw new ApiError(400, 'Expected a multipart/form-data upload');
	}
}
