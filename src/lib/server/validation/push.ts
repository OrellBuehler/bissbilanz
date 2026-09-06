import 'zod-openapi';
import { z } from 'zod';

/**
 * A browser PushSubscription as returned by `subscription.toJSON()`. The
 * endpoint is the push service URL; the keys are the ECDH public key and the
 * auth secret used to encrypt the payload.
 */
export const pushSubscriptionSchema = z
	.object({
		endpoint: z.string().url().max(2000),
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
