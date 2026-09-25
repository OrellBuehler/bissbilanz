import { error } from '@sveltejs/kit';
import { getHelpGuide } from '$lib/help/guides';
import type { PageLoad } from './$types';

// Only the slug is returned (not the guide object itself) so this data stays
// trivially serializable for the SSR → client handoff — the icon component
// and lazy content imports on a HelpGuide are not devalue-safe.
export const load: PageLoad = ({ params }) => {
	if (!getHelpGuide(params.slug)) error(404, 'Guide not found');
	return { slug: params.slug };
};
