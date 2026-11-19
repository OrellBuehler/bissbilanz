import type { RequestEvent } from '@sveltejs/kit';
import { handleApiError, requireAccountAccess, requireUuid } from '../../errors';
import { ChatRequestError, chatErrorResponse } from './service';

type ChatEvent<E extends RequestEvent> = E & { userId: string };

/**
 * Every chat route: first-party callers only (cookie session or a token with
 * the account scope), uuid path ids, and chat error codes in the body.
 */
export function chatRoute<E extends RequestEvent>(
	handler: (event: ChatEvent<E>) => Response | Promise<Response>
): (event: E) => Promise<Response> {
	return async (event) => {
		try {
			const userId = requireAccountAccess(event.locals);
			const id = (event.params as { id?: string }).id;
			if (id !== undefined) requireUuid(id);
			return await handler({ ...event, userId } as ChatEvent<E>);
		} catch (error) {
			if (error instanceof ChatRequestError) return chatErrorResponse(error);
			return handleApiError(error);
		}
	};
}
