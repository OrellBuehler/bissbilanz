export type CameraError =
	| 'permission_denied'
	| 'not_found'
	| 'not_readable'
	| 'overconstrained'
	| 'unknown';

export function mapCameraError(err: unknown): CameraError {
	if (err instanceof DOMException) {
		switch (err.name) {
			case 'NotAllowedError':
				return 'permission_denied';
			case 'NotFoundError':
				return 'not_found';
			case 'NotReadableError':
			case 'AbortError':
				return 'not_readable';
			case 'OverconstrainedError':
				return 'overconstrained';
		}
	}
	return 'unknown';
}

export async function startCamera(
	video: HTMLVideoElement,
	facingMode: 'environment' | 'user' = 'environment'
): Promise<MediaStream> {
	const stream = await navigator.mediaDevices.getUserMedia({
		video: { facingMode: { ideal: facingMode } },
		audio: false
	});
	video.srcObject = stream;
	await video.play();
	return stream;
}

export function stopCamera(stream: MediaStream | null) {
	if (!stream) return;
	for (const track of stream.getTracks()) {
		track.stop();
	}
}
