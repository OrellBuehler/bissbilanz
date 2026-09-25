<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Search from '@lucide/svelte/icons/search';
	import { helpGuides, type HelpPlatform } from '$lib/help/guides';
	import * as m from '$lib/paraglide/messages';

	let query = $state('');

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return helpGuides;
		return helpGuides.filter(
			(guide) =>
				guide.title().toLowerCase().includes(q) || guide.summary().toLowerCase().includes(q)
		);
	});

	const platformLabel = (platform: HelpPlatform) => {
		if (platform === 'ios') return m.help_platform_ios();
		if (platform === 'android') return m.help_platform_android();
		return m.help_platform_web();
	};
</script>

<Seo title={m.seo_help_title()} description={m.seo_help_description()} path="/help" />

<div class="mx-auto max-w-4xl px-6 py-12">
	<h1 class="mb-2 text-3xl font-bold">{m.help_index_title()}</h1>
	<p class="mb-8 text-muted-foreground">{m.help_index_subtitle()}</p>

	<div class="relative mb-8 max-w-sm">
		<Search
			class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			class="pl-9"
			placeholder={m.help_index_search_placeholder()}
			aria-label={m.help_index_search_placeholder()}
			bind:value={query}
		/>
	</div>

	{#if filtered.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.help_index_empty()}</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			{#each filtered as guide (guide.slug)}
				<a
					href="/help/{guide.slug}"
					class="group rounded-xl border border-border/60 p-4 transition-colors hover:border-border hover:bg-accent/40"
				>
					<div class="mb-3 flex items-center gap-3">
						<div
							class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
						>
							<guide.icon class="size-4.5" />
						</div>
						<h2 class="font-semibold">{guide.title()}</h2>
					</div>
					<p class="mb-3 text-sm text-muted-foreground">{guide.summary()}</p>
					{#if guide.platforms.length < 3}
						<div class="flex flex-wrap gap-1.5">
							{#each guide.platforms as platform (platform)}
								<Badge variant="outline" class="text-[10px] font-normal text-muted-foreground">
									{platformLabel(platform)}
								</Badge>
							{/each}
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{/if}

	<div class="mt-10 border-t pt-6 text-sm text-muted-foreground">
		<p>
			{m.help_still_need_help()}
			<a href="/support" class="underline">{m.help_contact_support()}</a>
		</p>
	</div>
</div>
