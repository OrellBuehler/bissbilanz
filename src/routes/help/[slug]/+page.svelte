<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { getLocale } from '$lib/paraglide/runtime';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { getHelpGuide, helpGuides } from '$lib/help/guides';
	import { helpContent } from '$lib/help/content';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The load function only validates & forwards the slug (see +page.ts) — the
	// guide lookup itself happens here, client- and server-side alike.
	const guide = $derived(getHelpGuide(data.slug)!);
	const locale = $derived(getLocale());
	// Content components are imported eagerly (see content/index.ts) rather than
	// lazily per guide/locale — a lazy `import()` resolves as a pending promise
	// during SvelteKit's synchronous SSR render, which would leave the guide
	// body out of the page search engines actually see.
	const Content = $derived(helpContent[guide.slug][locale === 'de' ? 'de' : 'en']);

	const index = $derived(helpGuides.findIndex((g) => g.slug === guide.slug));
	const prevGuide = $derived(index > 0 ? helpGuides[index - 1] : null);
	const nextGuide = $derived(
		index >= 0 && index < helpGuides.length - 1 ? helpGuides[index + 1] : null
	);
</script>

<Seo
	title={`${guide.title()} — Bissbilanz`}
	description={guide.summary()}
	path={`/help/${guide.slug}`}
/>

<div class="mx-auto max-w-2xl px-6 py-12">
	<a
		href="/help"
		class="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="size-4" />
		{m.help_back_to_index()}
	</a>

	<div class="mb-2 flex items-center gap-3">
		<div
			class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
		>
			<guide.icon class="size-5" />
		</div>
		<h1 class="text-2xl font-bold">{guide.title()}</h1>
	</div>
	<p class="mb-8 text-muted-foreground">{guide.summary()}</p>

	<Content />

	<p class="mt-10 border-t pt-6 text-sm text-muted-foreground">
		{m.help_still_need_help()}
		<a href="/support" class="underline">{m.help_contact_support()}</a>
	</p>

	{#if prevGuide || nextGuide}
		<div class="mt-6 flex items-center justify-between gap-3 border-t pt-6 text-sm">
			{#if prevGuide}
				<a
					href="/help/{prevGuide.slug}"
					class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
				>
					<ChevronLeft class="size-4" />
					{prevGuide.title()}
				</a>
			{:else}
				<span></span>
			{/if}
			{#if nextGuide}
				<a
					href="/help/{nextGuide.slug}"
					class="inline-flex items-center gap-1 text-right text-muted-foreground hover:text-foreground"
				>
					{nextGuide.title()}
					<ChevronRight class="size-4" />
				</a>
			{/if}
		</div>
	{/if}
</div>
