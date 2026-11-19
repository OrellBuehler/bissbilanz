import 'zod-openapi';
import { z } from 'zod';
import { paginationSchema } from './pagination';
import { MAX_AI_TASK_PHOTOS } from './ai-tasks';

export const CHAT_TEXT_MAX_CHARS = 4000;
export const CHAT_TITLE_MAX_CHARS = 120;

const title = z.string().trim().min(1).max(CHAT_TITLE_MAX_CHARS);

export const chatConversationCreateSchema = z
	.object({
		id: z.string().uuid().optional().meta({
			description:
				'Client-generated id. Creating the same id again returns the existing conversation (200) instead of a second one.'
		}),
		title: title.nullable().optional().meta({
			description:
				'Optional title. Without one, the first message sets it (its first 60 characters).'
		})
	})
	.meta({ id: 'ChatConversationCreate' });

export const chatConversationUpdateSchema = z
	.object({
		title: title.nullable().meta({ description: 'New title, or null to clear it.' })
	})
	.meta({ id: 'ChatConversationUpdate' });

export const chatConversationListQuerySchema = paginationSchema.meta({
	id: 'ChatConversationListQuery'
});

export const chatMessageContextSchema = z
	.object({
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional()
			.meta({ description: 'The diary day (YYYY-MM-DD) the user has open in the app.' }),
		timezone: z.string().min(1).max(64).optional().meta({
			description:
				"The device's IANA time zone, e.g. Europe/Zurich. The diary keeps using the user's time zone preference; this only tells the assistant when the device differs."
		}),
		locale: z.string().min(2).max(35).optional().meta({
			description:
				"BCP 47 language of the app, e.g. de or en-US. The assistant replies in it; defaults to the account's locale."
		})
	})
	.meta({ id: 'ChatMessageContext' });

export const chatMessageCreateSchema = z
	.object({
		id: z.string().uuid().meta({
			description:
				'Client-generated message id and idempotency key: sending the same id again returns the stored message and its run and never starts a second run.'
		}),
		text: z.string().trim().min(1).max(CHAT_TEXT_MAX_CHARS),
		imageFilenames: z
			.array(z.string().regex(/^(\/uploads\/)?[a-f0-9-]+\.webp$/))
			.max(MAX_AI_TASK_PHOTOS)
			.optional()
			.meta({
				description:
					'Photos uploaded with POST /api/ai-tasks/photo (or /api/images/upload) by this user, as `<uuid>.webp` or `/uploads/<uuid>.webp`. At most 5; files over 4 MB are not sent to the model.'
			}),
		context: chatMessageContextSchema.optional()
	})
	.meta({ id: 'ChatMessageCreate' });

export type ChatMessageCreate = z.infer<typeof chatMessageCreateSchema>;

export const chatEventsQuerySchema = z
	.object({
		after: z.preprocess(
			(value) => (value === undefined || value === null || value === '' ? undefined : value),
			z.coerce.number().int().min(0).default(0)
		),
		limit: z.preprocess(
			(value) => (value === undefined || value === null || value === '' ? undefined : value),
			z.coerce.number().int().min(1).max(500).default(500)
		)
	})
	.meta({ id: 'ChatEventsQuery' });

export const chatActionDecisionSchema = z
	.object({
		decision: z.enum(['approve', 'reject'])
	})
	.meta({ id: 'ChatActionDecision' });
