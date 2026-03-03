import { describe, expect, test } from 'vitest';
import { mapCameraError } from '../../src/lib/utils/camera';

describe('mapCameraError', () => {
	test('maps NotAllowedError to permission_denied', () => {
		const err = new DOMException('Permission denied', 'NotAllowedError');
		expect(mapCameraError(err)).toBe('permission_denied');
	});

	test('maps NotFoundError to not_found', () => {
		const err = new DOMException('No camera', 'NotFoundError');
		expect(mapCameraError(err)).toBe('not_found');
	});

	test('maps NotReadableError to not_readable', () => {
		const err = new DOMException('In use', 'NotReadableError');
		expect(mapCameraError(err)).toBe('not_readable');
	});

	test('maps AbortError to not_readable', () => {
		const err = new DOMException('Aborted', 'AbortError');
		expect(mapCameraError(err)).toBe('not_readable');
	});

	test('maps OverconstrainedError to overconstrained', () => {
		const err = new DOMException('Constraints not met', 'OverconstrainedError');
		expect(mapCameraError(err)).toBe('overconstrained');
	});

	test('returns unknown for non-DOMException errors', () => {
		expect(mapCameraError(new Error('generic'))).toBe('unknown');
	});

	test('returns unknown for unrecognized DOMException names', () => {
		const err = new DOMException('Something', 'SomeOtherError');
		expect(mapCameraError(err)).toBe('unknown');
	});

	test('returns unknown for non-error values', () => {
		expect(mapCameraError('string error')).toBe('unknown');
		expect(mapCameraError(null)).toBe('unknown');
		expect(mapCameraError(undefined)).toBe('unknown');
	});
});
