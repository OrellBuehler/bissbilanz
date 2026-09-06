import { parseRows } from '$lib/label-parser';
import type { ParsedNutrition } from '$lib/label-parser';

/**
 * Browser-side nutrition-label OCR. Tesseract (worker + wasm core + ~4 MB of
 * language data) is loaded lazily on the first scan so it never touches the app
 * bundle or the service-worker precache.
 */

export type OcrPhase = 'loading' | 'recognizing';

export type OcrProgress = {
	phase: OcrPhase;
	/** 0…1 within the current phase. */
	progress: number;
};

export type LabelOcrResult = {
	parsed: ParsedNutrition;
	rows: string[];
};

const base = __OCR_ASSET_BASE__;

export const recognizeLabel = async (
	image: Blob,
	onProgress?: (progress: OcrProgress) => void
): Promise<LabelOcrResult> => {
	const { createWorker } = await import('tesseract.js');

	const worker = await createWorker(['eng', 'deu'], 1, {
		workerPath: `${base}/worker.min.js`,
		corePath: base,
		langPath: `${base}/lang`,
		workerBlobURL: false,
		logger: (message) => {
			if (message.status === 'recognizing text') {
				onProgress?.({ phase: 'recognizing', progress: message.progress });
			} else {
				onProgress?.({ phase: 'loading', progress: message.progress });
			}
		}
	});

	try {
		const { data } = await worker.recognize(image, {}, { text: true });
		const rows = data.text
			.split('\n')
			.map((row) => row.trim())
			.filter((row) => row.length > 0);
		return { parsed: parseRows(rows), rows };
	} finally {
		await worker.terminate();
	}
};
