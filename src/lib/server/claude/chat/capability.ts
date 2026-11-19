import * as Sentry from '@sentry/sveltekit';
import { serverToolAllowanceOf } from '../call';
import {
	gateStateFor,
	gateStatesFor,
	minTaskCallUsd,
	type ClaudeCapability,
	type ClaudeGateState
} from '../capability';
import type { ClaudeGateCode } from '../errors';
import { taskServerTools } from '../models';
import { maxCallCostUsd } from '../pricing';
import { CHAT_FIRST_CALL_INPUT_TOKENS, CHAT_MAX_TOKENS } from './constants';

export const minChatCallUsd = (model: string) =>
	maxCallCostUsd(
		model,
		CHAT_FIRST_CALL_INPUT_TOKENS,
		CHAT_MAX_TOKENS,
		serverToolAllowanceOf(taskServerTools(model))
	);

export type ChatCapability = {
	available: boolean;
	blockedReason?: ClaudeGateCode;
	remainingBudgetUsd?: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function getChatGateState(userId: string): Promise<ClaudeGateState> {
	return gateStateFor(userId, minChatCallUsd);
}

export function toChatCapability(state: ClaudeGateState): ChatCapability {
	if (!state.available) {
		return state.blockedBy
			? { available: false, blockedReason: state.blockedBy }
			: { available: false };
	}
	return { available: true, remainingBudgetUsd: round2(Math.max(0, state.remainingUsd)) };
}

export async function getChatCapability(userId: string): Promise<ChatCapability> {
	return toChatCapability(await getChatGateState(userId));
}

export async function getChatCapabilitySafe(userId: string): Promise<ChatCapability> {
	try {
		return await getChatCapability(userId);
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'chat-capability' } });
		return { available: false };
	}
}

/** The task capability with the chat capability inside, from one read of gates and spend. */
export async function getClaudeCapabilitiesSafe(
	userId: string
): Promise<ClaudeCapability & { chat: ChatCapability }> {
	try {
		const [task, chat] = await gateStatesFor(userId, [minTaskCallUsd, minChatCallUsd]);
		return {
			...(task!.available
				? { available: true, remainingBudgetUsd: round2(Math.max(0, task!.remainingUsd)) }
				: { available: false }),
			chat: toChatCapability(chat!)
		};
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'claude-capability' } });
		return { available: false, chat: { available: false } };
	}
}
