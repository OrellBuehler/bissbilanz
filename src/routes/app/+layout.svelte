<script lang="ts">
	import { setUser } from '$lib/stores/auth.svelte';
	import AppSidebar from '$lib/components/navigation/app-sidebar.svelte';
	import SiteHeader from '$lib/components/navigation/site-header.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	$effect(() => {
		setUser(data.user);
	});
</script>

<Sidebar.Provider
	style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
>
	<AppSidebar variant="inset" />
	<Sidebar.Inset>
		<SiteHeader />
		<div class="flex flex-1 flex-col">
			<main class="flex-1 p-4 lg:p-6">
				{@render children()}
			</main>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
