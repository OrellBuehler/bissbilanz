import { describe, expect, test } from 'vitest';
import { MAX_LOG_CALLS_PER_RUN } from '$lib/server/claude/tasks/processor';
import { aiTaskProposalAcceptSchema } from '$lib/server/validation/ai-tasks';

describe('proposal accept limit', () => {
	test('a proposal at the per-run log limit can be accepted in full', () => {
		const itemIds = Array.from({ length: MAX_LOG_CALLS_PER_RUN }, () => crypto.randomUUID());
		expect(aiTaskProposalAcceptSchema.safeParse({ itemIds }).success).toBe(true);
	});
});
