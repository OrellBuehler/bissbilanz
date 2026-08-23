<script lang="ts">
	import { baseLocale, getLocale } from '$lib/paraglide/runtime';
	import { absoluteUrl, alternateUrls, ogLocale, OG_IMAGE } from '$lib/seo';

	type Props = {
		title: string;
		description: string;
		path: string;
		type?: string;
		image?: string;
		noindex?: boolean;
		jsonLd?: unknown;
	};

	let {
		title,
		description,
		path,
		type = 'website',
		image = OG_IMAGE,
		noindex = false,
		jsonLd
	}: Props = $props();

	const locale = $derived(getLocale());
	const canonical = $derived(absoluteUrl(path, locale));
	const alternates = $derived(alternateUrls(path));
	const jsonLdScript = $derived(
		jsonLd
			? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}<\/script>`
			: ''
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	{#if noindex}
		<meta name="robots" content="noindex, follow" />
	{:else}
		<meta name="robots" content="index, follow, max-image-preview:large" />
		{#each alternates as alternate (alternate.locale)}
			<link rel="alternate" hreflang={alternate.locale} href={alternate.href} />
		{/each}
		<link rel="alternate" hreflang="x-default" href={absoluteUrl(path, baseLocale)} />
	{/if}

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content="Bissbilanz" />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Bissbilanz" />
	<meta property="og:locale" content={ogLocale(locale)} />
	{#each alternates.filter((a) => a.locale !== locale) as alternate (alternate.locale)}
		<meta property="og:locale:alternate" content={ogLocale(alternate.locale)} />
	{/each}

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />

	{#if jsonLdScript}
		{@html jsonLdScript}
	{/if}
</svelte:head>
