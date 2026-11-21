import { describe, expect, test } from 'vitest';
import { sentryRelease } from '../../src/lib/sentry-release';

describe('sentryRelease', () => {
	test('names a release build after its version without the v prefix', () => {
		expect(sentryRelease('v1.61.0')).toBe('bissbilanz-web@1.61.0');
		expect(sentryRelease('1.61.0')).toBe('bissbilanz-web@1.61.0');
		expect(sentryRelease(' v1.61.1-rc.1 ')).toBe('bissbilanz-web@1.61.1-rc.1');
	});

	test('has no release for dev, PR or missing versions', () => {
		expect(sentryRelease('dev')).toBeUndefined();
		expect(sentryRelease('pr-942')).toBeUndefined();
		expect(sentryRelease('')).toBeUndefined();
		expect(sentryRelease(undefined)).toBeUndefined();
		expect(sentryRelease(61)).toBeUndefined();
	});
});
