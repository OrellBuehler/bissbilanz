import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth } from '$lib/server/errors';
import {
	cancelEnrichmentJob,
	getEnrichmentStatus,
	startEnrichmentJob
} from '$lib/server/food-enrichment/jobs';
import { abortEnrichmentJob, wakeEnrichmentJob } from '$lib/server/food-enrichment/worker';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		return json(await getEnrichmentStatus(userId));
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const { status, queued } = await startEnrichmentJob(userId);
		if (queued) wakeEnrichmentJob(userId);
		return json(status, { status: 202 });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const status = await cancelEnrichmentJob(userId);
		abortEnrichmentJob(userId);
		return json(status);
	} catch (error) {
		return handleApiError(error);
	}
};
