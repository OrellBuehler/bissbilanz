import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { createBarcodeScanner, _resetDetectorCache } from '../../src/lib/utils/barcode-detect';

function makeVideo(readyState = 4) {
	return { readyState } as unknown as HTMLVideoElement;
}

function wait(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

describe('barcode-detect debounce logic', () => {
	beforeEach(() => {
		_resetDetectorCache();
	});

	test('calls onDetect when barcode is detected', async () => {
		const onDetect = mock(() => {});
		const detectMock = mock(() => Promise.resolve([{ rawValue: '1234567890123' }]));

		(globalThis as Record<string, unknown>).BarcodeDetector = class {
			static getSupportedFormats = () => Promise.resolve(['ean_13']);
			detect = detectMock;
			constructor() {}
		};

		const scanner = await createBarcodeScanner(makeVideo(), onDetect);
		await wait(150);

		expect(onDetect).toHaveBeenCalledWith('1234567890123');

		scanner.stop();
		delete (globalThis as Record<string, unknown>).BarcodeDetector;
	});

	test('debounces same barcode within 2 seconds', async () => {
		const detectMock = mock(() => Promise.resolve([{ rawValue: 'ABC123' }]));
		const onDetect = mock(() => {});

		(globalThis as Record<string, unknown>).BarcodeDetector = class {
			static getSupportedFormats = () => Promise.resolve(['ean_13']);
			detect = detectMock;
			constructor() {}
		};

		const scanner = await createBarcodeScanner(makeVideo(), onDetect);
		await wait(350);

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

		const scanner = await createBarcodeScanner(makeVideo(), onDetect);
		scanner.stop();
		await wait(150);

		expect(onDetect).toHaveBeenCalledTimes(0);

		delete (globalThis as Record<string, unknown>).BarcodeDetector;
	});
});
