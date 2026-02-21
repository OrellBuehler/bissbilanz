<script lang="ts">
	import { page } from '$app/stores';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import * as m from '$lib/paraglide/messages';
	import { deLocalizeHref } from '$lib/paraglide/runtime';

	const labelMap: Record<string, () => string> = {
		app: () => m.nav_dashboard(),
		foods: () => m.nav_foods(),
		recipes: () => m.nav_recipes(),
		goals: () => m.nav_goals(),
		history: () => m.nav_history(),
		settings: () => m.nav_settings(),
		favorites: () => m.nav_favorites(),
		supplements: () => m.nav_supplements(),
		weight: () => m.nav_weight(),
		new: () => m.foods_new(),
		mcp: () => 'MCP'
	};

	const UUID_RE = /^[0-9a-f]{8}-/i;

	const breadcrumbs = $derived.by(() => {
		const pathname = deLocalizeHref($page.url.pathname);
		const segments = pathname.split('/').filter(Boolean);
		const crumbs: Array<{ label: string; href: string; isId: boolean }> = [];

		for (let i = 1; i < segments.length; i++) {
			const segment = segments[i];
			const href = '/' + segments.slice(0, i + 1).join('/');
			const isId = UUID_RE.test(segment);
			const label = isId ? '...' : (labelMap[segment]?.() || segment);
			crumbs.push({ label, href, isId });
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
					{#if !crumb.isId}
						{#if i > 0}
							<Breadcrumb.Separator />
						{/if}
						<Breadcrumb.Item>
							{#if i === breadcrumbs.length - 1 || breadcrumbs[i + 1]?.isId}
								<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
							{:else}
								<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
							{/if}
						</Breadcrumb.Item>
					{/if}
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>
