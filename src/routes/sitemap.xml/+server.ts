import { locales } from '$lib/paraglide/runtime';
import { absoluteUrl } from '$lib/seo';
import type { RequestHandler } from './$types';

const PAGES = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/support', changefreq: 'monthly', priority: '0.6' },
	{ path: '/privacy', changefreq: 'yearly', priority: '0.3' },
	{ path: '/account-deletion', changefreq: 'yearly', priority: '0.2' }
];

export const GET: RequestHandler = async () => {
	const urls = PAGES.flatMap((page) =>
		locales.map((locale) => {
			const alternates = locales
				.map(
					(alt) =>
						`\t\t<xhtml:link rel="alternate" hreflang="${alt}" href="${absoluteUrl(page.path, alt)}" />`
				)
				.join('\n');
			return [
				'\t<url>',
				`\t\t<loc>${absoluteUrl(page.path, locale)}</loc>`,
				alternates,
				`\t\t<xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(page.path, 'en')}" />`,
				`\t\t<changefreq>${page.changefreq}</changefreq>`,
				`\t\t<priority>${page.priority}</priority>`,
				'\t</url>'
			].join('\n');
		})
	).join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

	return new Response(xml, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
