/** Longest edge the OCR input is scaled down to — bigger only costs time. */
const MAX_EDGE = 1600;

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
	new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
			'image/jpeg',
			0.92
		)
	);

const draw = (source: CanvasImageSource, width: number, height: number): HTMLCanvasElement => {
	const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas is unavailable');
	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return canvas;
};

/** Downscales a captured photo so OCR stays fast on phones. */
export const prepareImage = async (file: Blob): Promise<Blob> => {
	const bitmap = await createImageBitmap(file);
	try {
		return await toBlob(draw(bitmap, bitmap.width, bitmap.height));
	} finally {
		bitmap.close();
	}
};

/** Grabs the current video frame as a downscaled still. */
export const captureFrame = (video: HTMLVideoElement): Promise<Blob> =>
	toBlob(draw(video, video.videoWidth, video.videoHeight));
