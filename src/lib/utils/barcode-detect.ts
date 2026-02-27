import * as Sentry from '@sentry/sveltekit';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';

const FORMATS = [
	BarcodeFormat.EAN_13,
	BarcodeFormat.EAN_8,
	BarcodeFormat.UPC_A,
	BarcodeFormat.UPC_E
];
const DEBOUNCE_MS = 2000;

export async function createBarcodeScanner(
	video: HTMLVideoElement,
	onDetect: (barcode: string) => void
): Promise<{ stop: () => void }> {
	const hints = new Map<DecodeHintType, unknown>();
	hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);

	const reader = new BrowserMultiFormatReader(hints);

	let lastBarcode = '';
	let lastTime = 0;

	const controls: IScannerControls = await reader.decodeFromVideoElement(
		video,
		(result, err, _controls) => {
			if (result) {
				const barcode = result.getText();
				const now = Date.now();
				if (barcode !== lastBarcode || now - lastTime > DEBOUNCE_MS) {
					lastBarcode = barcode;
					lastTime = now;
					onDetect(barcode);
				}
			} else if (err && !(err instanceof NotFoundException)) {
				Sentry.captureException(err, {
					tags: { feature: 'barcode' }
				});
			}
		}
	);

	Sentry.addBreadcrumb({
		category: 'barcode',
		message: 'Scanner initialized (zxing-js)',
		level: 'info'
	});

	return {
		stop() {
			controls.stop();
		}
	};
}
