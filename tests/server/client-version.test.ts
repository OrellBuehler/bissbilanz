import { describe, expect, test } from 'vitest';
import { compareVersions, parseVersion } from '../../src/lib/client-version';
import {
	readClientInfo,
	requiredMinimum,
	updateRequiredResponse
} from '../../src/lib/server/client-version';

const request = (headers: Record<string, string>) =>
	new Request('http://localhost/api/goals', { headers });

describe('parseVersion', () => {
	test('accepts plain, v-prefixed and suffixed versions', () => {
		expect(parseVersion('1.52.0')).toEqual([1, 52, 0]);
		expect(parseVersion('v1.52.3')).toEqual([1, 52, 3]);
		expect(parseVersion('1.52.0-rc.1')).toEqual([1, 52, 0]);
	});

	test('rejects non-versions', () => {
		expect(parseVersion('dev')).toBeNull();
		expect(parseVersion('1.52')).toBeNull();
		expect(parseVersion('1.52.0.4')).toBeNull();
	});

	test('compares numerically, not lexically', () => {
		expect(compareVersions([1, 10, 0], [1, 9, 9])).toBeGreaterThan(0);
		expect(compareVersions([1, 9, 0], [1, 9, 0])).toBe(0);
		expect(compareVersions([0, 99, 0], [1, 0, 0])).toBeLessThan(0);
	});
});

describe('readClientInfo', () => {
	test('reads platform and version', () => {
		expect(
			readClientInfo(request({ 'x-client-platform': 'iOS', 'x-client-version': '1.52.0' }))
		).toEqual({ platform: 'ios', version: '1.52.0' });
	});

	test('ignores missing, unknown or malformed headers', () => {
		expect(readClientInfo(request({}))).toBeNull();
		expect(readClientInfo(request({ 'x-client-version': '1.52.0' }))).toBeNull();
		expect(
			readClientInfo(request({ 'x-client-platform': 'desktop', 'x-client-version': '1.52.0' }))
		).toBeNull();
		expect(
			readClientInfo(request({ 'x-client-platform': 'android', 'x-client-version': 'dev' }))
		).toBeNull();
	});
});

describe('requiredMinimum', () => {
	const minimums = { android: '1.53.0' };

	test('blocks versions below the platform minimum', () => {
		expect(requiredMinimum({ platform: 'android', version: '1.52.9' }, minimums)).toBe('1.53.0');
	});

	test('allows the minimum itself, newer versions and platforms without a minimum', () => {
		expect(requiredMinimum({ platform: 'android', version: '1.53.0' }, minimums)).toBeNull();
		expect(requiredMinimum({ platform: 'android', version: '2.0.0' }, minimums)).toBeNull();
		expect(requiredMinimum({ platform: 'ios', version: '0.1.0' }, minimums)).toBeNull();
	});
});

describe('updateRequiredResponse', () => {
	test('is a 426 carrying the minimum in body and header', async () => {
		const response = updateRequiredResponse('ios', '1.53.0');
		expect(response.status).toBe(426);
		expect(response.headers.get('x-client-min-version')).toBe('1.53.0');
		expect(await response.json()).toEqual({
			error: 'Update required',
			code: 'client_update_required',
			platform: 'ios',
			minVersion: '1.53.0'
		});
	});
});
