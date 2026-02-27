import { describe, expect, test, mock, beforeEach } from 'bun:test';

let decodeCallback: ((result: unknown, err: unknown) => void) | null = null;
const stopMock = mock(() => {});
const captureExceptionMock = mock(() => {});
let shouldReject = false;

mock.module('@sentry/sveltekit', () => ({
	addBreadcrumb: () => {},
	captureException: captureExceptionMock
}));

class MockNotFoundException extends Error {
	name = 'NotFoundException';
}

mock.module('@zxing/browser', () => ({
	BrowserMultiFormatReader: class {
		constructor() {}
		decodeFromVideoElement(_video: unknown, cb: (result: unknown, err: unknown) => void) {
			if (shouldReject) return Promise.reject(new Error('video element unavailable'));
			decodeCallback = cb;
			return Promise.resolve({ stop: stopMock });
		}
	}
}));

mock.module('@zxing/library', () => ({
	BarcodeFormat: { EAN_13: 0, EAN_8: 1, UPC_A: 2, UPC_E: 3 },
	DecodeHintType: { POSSIBLE_FORMATS: 0 },
	NotFoundException: MockNotFoundException
}));

import { createBarcodeScanner } from '../../src/lib/utils/barcode-detect';

function makeVideo() {
	return {} as unknown as HTMLVideoElement;
}

describe('barcode-detect', () => {
	beforeEach(() => {
		decodeCallback = null;
		stopMock.mockClear();
		captureExceptionMock.mockClear();
		shouldReject = false;
	});

	test('calls onDetect when barcode is detected', async () => {
		const onDetect = mock(() => {});
		await createBarcodeScanner(makeVideo(), onDetect);

		decodeCallback!({ getText: () => '1234567890123' }, null);

		expect(onDetect).toHaveBeenCalledWith('1234567890123');
	});

	test('debounces same barcode within 2 seconds', async () => {
		const onDetect = mock(() => {});
		await createBarcodeScanner(makeVideo(), onDetect);

		decodeCallback!({ getText: () => 'ABC123' }, null);
		decodeCallback!({ getText: () => 'ABC123' }, null);
		decodeCallback!({ getText: () => 'ABC123' }, null);

		expect(onDetect).toHaveBeenCalledTimes(1);
	});

	test('allows same barcode after debounce window expires', async () => {
		const onDetect = mock(() => {});
		const originalNow = Date.now;
		let fakeTime = 1000;
		Date.now = () => fakeTime;

		await createBarcodeScanner(makeVideo(), onDetect);

		decodeCallback!({ getText: () => 'REPEAT' }, null);
		expect(onDetect).toHaveBeenCalledTimes(1);

		fakeTime += 2001;
		decodeCallback!({ getText: () => 'REPEAT' }, null);
		expect(onDetect).toHaveBeenCalledTimes(2);

		Date.now = originalNow;
	});

	test('allows different barcodes immediately', async () => {
		const onDetect = mock(() => {});
		await createBarcodeScanner(makeVideo(), onDetect);

		decodeCallback!({ getText: () => 'FIRST' }, null);
		decodeCallback!({ getText: () => 'SECOND' }, null);

		expect(onDetect).toHaveBeenCalledTimes(2);
		expect(onDetect).toHaveBeenCalledWith('FIRST');
		expect(onDetect).toHaveBeenCalledWith('SECOND');
	});

	test('stop calls controls.stop', async () => {
		const scanner = await createBarcodeScanner(makeVideo(), () => {});
		scanner.stop();

		expect(stopMock).toHaveBeenCalledTimes(1);
	});

	test('ignores NotFoundException from decoder', async () => {
		const onDetect = mock(() => {});
		await createBarcodeScanner(makeVideo(), onDetect);

		decodeCallback!(null, new MockNotFoundException('no barcode found'));

		expect(onDetect).toHaveBeenCalledTimes(0);
		expect(captureExceptionMock).toHaveBeenCalledTimes(0);
	});

	test('reports non-NotFoundException errors to Sentry', async () => {
		const onDetect = mock(() => {});
		await createBarcodeScanner(makeVideo(), onDetect);

		const realError = new Error('checksum failure');
		decodeCallback!(null, realError);

		expect(onDetect).toHaveBeenCalledTimes(0);
		expect(captureExceptionMock).toHaveBeenCalledTimes(1);
		expect(captureExceptionMock).toHaveBeenCalledWith(realError, {
			tags: { feature: 'barcode' }
		});
	});

	test('rejects when decodeFromVideoElement fails', async () => {
		shouldReject = true;

		await expect(createBarcodeScanner(makeVideo(), () => {})).rejects.toThrow(
			'video element unavailable'
		);
	});
});
