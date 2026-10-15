import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiError, validationError, withAuthedResource } from '$lib/server/errors';
import { aiTaskProposalAcceptSchema } from '$lib/server/validation';
import { acceptProposal } from '$lib/server/claude/tasks/proposal';
import { serializeAiTask } from '$lib/server/ai-tasks';

const readOptionalBody = async (request: Request): Promise<unknown> => {
	const raw = await request.text();
	if (raw.trim() === '') return {};
	try {
		return JSON.parse(raw);
	} catch {
		throw new ApiError(400, 'Invalid JSON body');
	}
};

export const POST: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const parsed = aiTaskProposalAcceptSchema.safeParse(await readOptionalBody(request));
	if (!parsed.success) return validationError(parsed.error);
	const task = await acceptProposal(userId, id, parsed.data.itemIds);
	return json({ task: serializeAiTask(task) });
});
