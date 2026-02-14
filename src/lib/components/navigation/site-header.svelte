<script lang="ts">
	import { page } from '$app/stores';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import * as m from '$lib/paraglide/messages';

	const labelMap: Record<string, () => string> = {
		app: () => m.nav_dashboard(),
		foods: () => m.nav_foods(),
		recipes: () => m.nav_recipes(),
		goals: () => m.nav_goals(),
		history: () => m.nav_history(),
		settings: () => m.nav_settings(),
		new: () => m.foods_new(),
		mcp: () => 'MCP'
	};

	const breadcrumbs = $derived.by(() => {
		const pathname = $page.url.pathname;
		const segments = pathname.split('/').filter(Boolean);
		// segments: ['app'] or ['app', 'foods'] or ['app', 'foods', 'new'] etc.
		const crumbs: Array<{ label: string; href: string }> = [];

		for (let i = 1; i < segments.length; i++) {
			const segment = segments[i];
			const href = '/' + segments.slice(0, i + 1).join('/');
			const label = labelMap[segment]?.() || segment;
			crumbs.push({ label, href });
		}

		return crumbs;
	});
</script>

<header
	class="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
		<Sidebar.Trigger class="-ms-1" />
		<Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each breadcrumbs as crumb, i (crumb.href)}
					{#if i > 0}
						<Breadcrumb.Separator />
					{/if}
					<Breadcrumb.Item>
						{#if i === breadcrumbs.length - 1}
							<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
						{:else}
							<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>
