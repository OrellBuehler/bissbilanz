<script lang="ts">
	import { page } from '$app/stores';
	import { logout, getUser } from '$lib/stores/auth.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import LogOut from '@lucide/svelte/icons/log-out';
	import * as m from '$lib/paraglide/messages';
	import { deLocalizeHref } from '$lib/paraglide/runtime';

	const user = $derived(getUser());
	const userInitial = $derived((user?.name || user?.email || '?').charAt(0).toUpperCase());
	const userDisplay = $derived(user?.name || user?.email || '');

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
			const label = isId ? '...' : labelMap[segment]?.() || segment;
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
		<div class="ml-auto">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button {...props} class="flex h-9 w-9 items-center justify-center rounded-full">
							<Avatar.Root class="h-9 w-9 rounded-full">
								<Avatar.Fallback class="rounded-full">{userInitial}</Avatar.Fallback>
							</Avatar.Root>
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="min-w-56 rounded-lg" align="end" sideOffset={4}>
					<DropdownMenu.Label class="p-0 font-normal">
						<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
							<Avatar.Root class="size-8 rounded-lg">
								<Avatar.Fallback class="rounded-lg">{userInitial}</Avatar.Fallback>
							</Avatar.Root>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">{userDisplay}</span>
								{#if user?.name && user?.email}
									<span class="text-muted-foreground truncate text-xs">{user.email}</span>
								{/if}
							</div>
						</div>
					</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={logout}>
						<LogOut />
						{m.auth_logout()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</header>
