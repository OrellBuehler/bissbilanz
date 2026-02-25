import type { BarcodeDetector as BarcodeDetectorType } from 'barcode-detector/ponyfill';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
const DEBOUNCE_MS = 2000;
const SCAN_INTERVAL_MS = 100;

let cachedDetector: BarcodeDetectorType | null = null;

async function getDetector(): Promise<BarcodeDetectorType> {
	if (cachedDetector) return cachedDetector;
	if ('BarcodeDetector' in globalThis) {
		const NativeDetector = (globalThis as Record<string, unknown>)
			.BarcodeDetector as typeof BarcodeDetectorType;
		const supported = await NativeDetector.getSupportedFormats();
		if (FORMATS.some((f) => supported.includes(f))) {
			cachedDetector = new NativeDetector({ formats: [...FORMATS] });
			return cachedDetector;
		}
	}

	const { BarcodeDetector: Polyfill, prepareZXingModule } =
		await import('barcode-detector/ponyfill');
	prepareZXingModule({
		overrides: {
			locateFile: (path: string, prefix: string) => {
				if (path.endsWith('.wasm')) {
					return `/wasm/${path}`;
				}
				return prefix + path;
			}
		}
	});
	cachedDetector = new Polyfill({ formats: [...FORMATS] });
	return cachedDetector;
}

export function _resetDetectorCache() {
	cachedDetector = null;
}

export async function createBarcodeScanner(
	video: HTMLVideoElement,
	onDetect: (barcode: string) => void
): Promise<{ stop: () => void }> {
	const detector = await getDetector();
	let running = true;
	let lastBarcode = '';
	let lastTime = 0;

	const scan = async () => {
		if (!running) return;
		if (video.readyState >= 4) {
			const now = Date.now();
			try {
				const results = await detector.detect(video);
				if (results.length > 0) {
					const barcode = results[0].rawValue;
					if (barcode !== lastBarcode || now - lastTime > DEBOUNCE_MS) {
						lastBarcode = barcode;
						lastTime = now;
						onDetect(barcode);
					}
				}
			} catch {
				// detection frame failed, continue scanning
			}
		}
		if (running) {
			setTimeout(scan, SCAN_INTERVAL_MS);
		}
	};

	setTimeout(scan, SCAN_INTERVAL_MS);

	return {
		stop() {
			running = false;
		}
	};
}
