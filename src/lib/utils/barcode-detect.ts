import type { BarcodeDetector as BarcodeDetectorType } from 'barcode-detector/ponyfill';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
const DEBOUNCE_MS = 2000;
const SCAN_INTERVAL_MS = 100;

async function getDetector(): Promise<BarcodeDetectorType> {
	if ('BarcodeDetector' in globalThis) {
		const NativeDetector = (globalThis as Record<string, unknown>)
			.BarcodeDetector as typeof BarcodeDetectorType;
		const supported = await NativeDetector.getSupportedFormats();
		if (FORMATS.some((f) => supported.includes(f))) {
			return new NativeDetector({ formats: [...FORMATS] });
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
	return new Polyfill({ formats: [...FORMATS] });
}

export async function createBarcodeScanner(
	video: HTMLVideoElement,
	onDetect: (barcode: string) => void
): Promise<{ stop: () => void }> {
	const detector = await getDetector();
	let running = true;
	let lastBarcode = '';
	let lastTime = 0;
	let lastScanTime = 0;

	const scan = async () => {
		if (!running) return;
		const now = Date.now();
		if (
			now - lastScanTime >= SCAN_INTERVAL_MS &&
			video.readyState >= 4
		) {
			lastScanTime = now;
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
			requestAnimationFrame(scan);
		}
	};

	requestAnimationFrame(scan);

	return {
		stop() {
			running = false;
		}
	};
}
