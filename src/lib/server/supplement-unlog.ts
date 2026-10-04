import { unlogSupplement } from '$lib/server/supplements';
import { requireDate } from '$lib/server/errors';

export async function unlogSupplementOnDate(
	userId: string,
	supplementId: string,
	date: string | null
): Promise<Response> {
	const validDate = requireDate(date);
	await unlogSupplement(userId, supplementId, validDate);
	return new Response(null, { status: 204 });
}
