import type { RequestHandler } from './$types';
import { unlogSupplementOnDate } from '$lib/server/supplement-unlog';
import { withAuthedResource } from '$lib/server/errors';

export const DELETE: RequestHandler = withAuthedResource(({ userId, id, params }) =>
	unlogSupplementOnDate(userId, id, params.date)
);
