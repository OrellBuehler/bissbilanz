const FORMATS: BarcodeFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const DEBOUNCE_MS = 2000;

async function getDetector(): Promise<BarcodeDetector> {
	if ('BarcodeDetector' in globalThis) {
		const supported = await BarcodeDetector.getSupportedFormats();
		if (FORMATS.some((f) => supported.includes(f))) {
			return new BarcodeDetector({ formats: FORMATS });
		}
	}

	const { BarcodeDetector: Polyfill, prepareZXingModule } = await import('barcode-detector/ponyfill');
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
	return new Polyfill({ formats: FORMATS }) as unknown as BarcodeDetector;
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
		if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
			try {
				const results = await detector.detect(video);
				if (results.length > 0) {
					const barcode = results[0].rawValue;
					const now = Date.now();
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
