import { enabledProviderIds } from '$lib/server/auth-providers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	providers: enabledProviderIds()
});
