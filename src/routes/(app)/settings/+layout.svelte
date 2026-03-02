<script lang="ts">
	import { page } from '$app/stores';
	import Settings from '@lucide/svelte/icons/settings';
	import Plug from '@lucide/svelte/icons/plug';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const allTabs = [
		{ href: '/settings', label: () => m.settings_tab_general(), icon: Settings, exact: true },
		{ href: '/settings/mcp', label: () => m.settings_tab_mcp(), icon: Plug, exact: false }
	];

	const tabs = $derived(allTabs.filter((tab) => tab.href !== '/settings/mcp' || data.mcpEnabled));

	const isActive = (tab: (typeof allTabs)[number]) =>
		tab.exact ? $page.url.pathname === tab.href : $page.url.pathname.startsWith(tab.href);
</script>

<div class="mx-auto max-w-3xl">
	<div class="flex border-b mb-6">
		{#each tabs as tab}
			<a
				href={tab.href}
				class={cn(
					'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
					isActive(tab)
						? 'border-primary text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'
				)}
			>
				<tab.icon class="size-4" />
				{tab.label()}
			</a>
		{/each}
	</div>
	{@render children()}
</div>
