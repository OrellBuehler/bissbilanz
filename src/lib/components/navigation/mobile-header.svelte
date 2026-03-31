<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ChevronLeft } from '@lucide/svelte';
	import { deLocalizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	type Props = {
		headerExtra?: Snippet;
	};

	let { headerExtra }: Props = $props();

	const labelMap: Record<string, () => string> = {
		home: () => m.nav_dashboard(),
		foods: () => m.nav_foods(),
		recipes: () => m.nav_recipes(),
		goals: () => m.nav_goals(),
		history: () => m.nav_history(),
		settings: () => m.nav_settings(),
		favorites: () => m.nav_favorites(),
		supplements: () => m.nav_supplements(),
		weight: () => m.nav_weight(),
		insights: () => m.nav_insights(),
		new: () => m.foods_new(),
		maintenance: () => m.nav_maintenance(),
		mcp: () => 'MCP'
	};

	const isHome = $derived(deLocalizeHref($page.url.pathname) === '/home');

	const pageTitle = $derived.by(() => {
		const pathname = deLocalizeHref($page.url.pathname);
		const segments = pathname.split('/').filter(Boolean);
		const last = segments[segments.length - 1];
		return labelMap[last]?.() ?? last ?? '';
	});

	const tabPaths = new Set(['/home', '/favorites', '/foods', '/insights', '/settings']);

	const canGoBack = $derived.by(() => {
		const pathname = deLocalizeHref($page.url.pathname);
		return !tabPaths.has(pathname);
	});
</script>

<header
	class="sticky top-0 z-30 flex h-12 items-center gap-2 bg-background/95 px-3 backdrop-blur-sm md:hidden"
>
	{#if isHome}
		<div class="flex items-center gap-1">
			<img src="/icon.svg" alt="Bissbilanz" class="size-7 rounded-lg" />
			<span class="text-lg font-bold tracking-tight text-primary">{m.app_title()}</span>
		</div>
		<div class="ml-auto">
			{#if headerExtra}
				{@render headerExtra()}
			{/if}
		</div>
	{:else}
		{#if canGoBack}
			<Button
				variant="ghost"
				size="icon"
				class="size-9 shrink-0"
				onclick={() => {
					// Guard against iOS PWA showing browser chrome when history is empty
					if (history.length > 1) {
						history.back();
					}
				}}
			>
				<ChevronLeft class="size-5" />
			</Button>
		{/if}
		<h1 class="min-w-0 truncate text-lg font-semibold">{pageTitle}</h1>
		<div class="ml-auto">
			{#if headerExtra}
				{@render headerExtra()}
			{/if}
		</div>
	{/if}
</header>
