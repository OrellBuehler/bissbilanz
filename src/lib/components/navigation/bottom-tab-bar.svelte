<script lang="ts">
	import { page } from '$app/stores';
	import { getBottomNavTabs, DEFAULT_NAV_TABS } from '$lib/config/navigation';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';

	const prefsQuery = useLiveQuery(() => preferencesService.preferences(), undefined);
	const navTabs = $derived(prefsQuery.value?.navTabs ?? DEFAULT_NAV_TABS);
	const tabs = $derived(getBottomNavTabs(navTabs));

	function isActive(href: string, pathname: string): boolean {
		if (href === '/home') return pathname === '/home';
		if (href.includes('?')) return pathname.startsWith(href.split('?')[0]);
		return pathname.startsWith(href);
	}
</script>

<nav
	aria-label="Main navigation"
	class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border/50 bg-background/80 px-2 pb-1 pt-1 backdrop-blur-xl"
>
	{#each tabs as tab (tab.id)}
		{@const active = isActive(tab.href, $page.url.pathname)}
		<a
			href={tab.href}
			class="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 transition-colors {active
				? 'text-primary'
				: 'text-muted-foreground'}"
			aria-current={active ? 'page' : undefined}
		>
			<div
				class="relative flex h-8 w-8 items-center justify-center rounded-xl {active
					? 'bg-primary/10'
					: ''}"
			>
				<tab.icon class="size-5" />
			</div>
			<span class="text-[10px] font-semibold">{tab.title()}</span>
		</a>
	{/each}
</nav>
