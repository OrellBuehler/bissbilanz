import { describe, test, expect } from 'vitest';
import { isPushServiceEndpoint, pushSubscriptionSchema } from '$lib/server/validation/push';

describe('push subscription endpoint validation', () => {
	test("accepts the browser vendors' push services", () => {
		expect(isPushServiceEndpoint('https://fcm.googleapis.com/fcm/send/abc:APA91')).toBe(true);
		expect(isPushServiceEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(
			true
		);
		expect(isPushServiceEndpoint('https://web.push.apple.com/QGxyz')).toBe(true);
		expect(isPushServiceEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
	});

	test('rejects internal, plaintext and look-alike hosts', () => {
		expect(isPushServiceEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
		expect(isPushServiceEndpoint('http://127.0.0.1:9200/_shutdown')).toBe(false);
		expect(isPushServiceEndpoint('http://169.254.169.254/latest/meta-data/')).toBe(false);
		expect(isPushServiceEndpoint('https://push.services.mozilla.com.evil.example/x')).toBe(false);
		expect(isPushServiceEndpoint('https://notify.windows.com/x')).toBe(false);
		expect(isPushServiceEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
		expect(isPushServiceEndpoint('not a url')).toBe(false);
	});

	test('schema surfaces the endpoint rule', () => {
		const keys = { p256dh: 'p', auth: 'a' };
		expect(
			pushSubscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys }).success
		).toBe(true);
		expect(
			pushSubscriptionSchema.safeParse({ endpoint: 'https://example.com/hook', keys }).success
		).toBe(false);
	});
});
