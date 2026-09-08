import 'zod-openapi';
import { z } from 'zod';

/**
 * A browser PushSubscription as returned by `subscription.toJSON()`. The
 * endpoint is the push service URL; the keys are the ECDH public key and the
 * auth secret used to encrypt the payload.
 */
/**
 * Push endpoints are only ever minted by the browser vendors' push services.
 * Pinning the host keeps the server from POSTing encrypted blobs at arbitrary
 * (or internal) URLs handed to it by an authenticated client.
 */
const PUSH_SERVICE_HOSTS = [
	'fcm.googleapis.com',
	'android.googleapis.com',
	'web.push.apple.com',
	'.push.services.mozilla.com',
	'.notify.windows.com'
];

export const isPushServiceEndpoint = (value: string): boolean => {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:' || url.username || url.password) return false;
	const host = url.hostname.toLowerCase();
	return PUSH_SERVICE_HOSTS.some((allowed) =>
		allowed.startsWith('.')
			? host.endsWith(allowed) && host.length > allowed.length
			: host === allowed
	);
};

const pushEndpoint = z
	.string()
	.max(2000)
	.refine(isPushServiceEndpoint, 'Endpoint must be a known push service URL');

export const pushSubscriptionSchema = z
	.object({
		endpoint: pushEndpoint,
		keys: z.object({
			p256dh: z.string().min(1).max(255),
			auth: z.string().min(1).max(255)
		})
	})
	.meta({ id: 'PushSubscriptionCreate' });

export const pushSubscriptionDeleteSchema = z
	.object({
		endpoint: z.string().url().max(2000)
	})
	.meta({ id: 'PushSubscriptionDelete' });
