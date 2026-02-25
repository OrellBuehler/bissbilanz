import { describe, expect, test, mock, beforeEach } from 'bun:test';

const rafCallbacks: (() => void)[] = [];

globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
	rafCallbacks.push(() => cb(performance.now()));
	return rafCallbacks.length;
};

function flushRaf() {
	const cbs = rafCallbacks.splice(0);
	for (const cb of cbs) cb();
}

function makeVideo(readyState = 4) {
	return { readyState } as unknown as HTMLVideoElement;
}

function makeDetector(results: { rawValue: string }[] = []) {
	return {
		detect: mock(() => Promise.resolve(results)),
		getSupportedFormats: mock(() => Promise.resolve([]))
	};
}

describe('barcode-detect debounce logic', () => {
	beforeEach(() => {
		rafCallbacks.length = 0;
	});

	test('calls onDetect when barcode is detected', async () => {
		const onDetect = mock(() => {});
		const detector = makeDetector([{ rawValue: '1234567890123' }]);

		const { createBarcodeScanner } = await import('../../src/lib/utils/barcode-detect');

		const originalGetDetector = (globalThis as Record<string, unknown>).BarcodeDetector;
		(globalThis as Record<string, unknown>).BarcodeDetector = class {
			static getSupportedFormats = () => Promise.resolve(['ean_13']);
			detect = detector.detect;
			constructor() {}
		};

		const scanner = await createBarcodeScanner(makeVideo(), onDetect);
		flushRaf();
		await new Promise((r) => setTimeout(r, 10));

		expect(onDetect).toHaveBeenCalledWith('1234567890123');

		scanner.stop();
		(globalThis as Record<string, unknown>).BarcodeDetector = originalGetDetector;
	});

	test('debounces same barcode within 2 seconds', async () => {
		const onDetect = mock(() => {});
		const results = [{ rawValue: 'ABC123' }];
		const detectMock = mock(() => Promise.resolve(results));

		(globalThis as Record<string, unknown>).BarcodeDetector = class {
			static getSupportedFormats = () => Promise.resolve(['ean_13']);
			detect = detectMock;
			constructor() {}
		};

		const { createBarcodeScanner } = await import('../../src/lib/utils/barcode-detect');
		const scanner = await createBarcodeScanner(makeVideo(), onDetect);

		flushRaf();
		await new Promise((r) => setTimeout(r, 10));
		flushRaf();
		await new Promise((r) => setTimeout(r, 10));

		expect(onDetect).toHaveBeenCalledTimes(1);

		scanner.stop();
		delete (globalThis as Record<string, unknown>).BarcodeDetector;
	});

	test('stop prevents further scanning', async () => {
		const onDetect = mock(() => {});

		(globalThis as Record<string, unknown>).BarcodeDetector = class {
			static getSupportedFormats = () => Promise.resolve(['ean_13']);
			detect = () => Promise.resolve([{ rawValue: 'STOP_TEST' }]);
			constructor() {}
		};

		const { createBarcodeScanner } = await import('../../src/lib/utils/barcode-detect');
		const scanner = await createBarcodeScanner(makeVideo(), onDetect);

		scanner.stop();
		flushRaf();
		await new Promise((r) => setTimeout(r, 10));

		expect(onDetect).toHaveBeenCalledTimes(0);

		delete (globalThis as Record<string, unknown>).BarcodeDetector;
	});
});
