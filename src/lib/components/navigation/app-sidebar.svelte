<script lang="ts">
	import { page } from '$app/stores';
	import { getNavItems } from '$lib/config/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import X from '@lucide/svelte/icons/x';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import * as m from '$lib/paraglide/messages';
	import type { ComponentProps } from 'svelte';
	import type { NavItem } from '$lib/config/navigation';

	let { ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const navItems = getNavItems();
	const sidebar = useSidebar();

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
	}

	function menuButtonClass(item: NavItem, pathname: string): string {
		const base =
			'h-12 rounded-xl px-3 text-base transition-colors md:h-9 md:rounded-lg md:px-2 md:text-sm data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground hover:bg-sidebar-accent';
		return isActive(item.href, pathname) ? `${base} ${item.activeRing}` : base;
	}

	function handleNavClick() {
		if (sidebar.isMobile) {
			sidebar.setOpenMobile(false);
		}
	}

	function closeMobileSidebar() {
		sidebar.setOpenMobile(false);
	}

	function withMobileCloseClick(props: Record<string, unknown>): Record<string, unknown> {
		const originalOnClick = props.onclick;

		return {
			...props,
			onclick: (event: MouseEvent) => {
				if (typeof originalOnClick === 'function') {
					(originalOnClick as (event: MouseEvent) => void)(event);
				}

				handleNavClick();
			}
		};
	}
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps}>
	<Sidebar.Header class="gap-3 p-2 md:gap-2">
		<Sidebar.Menu class="gap-0">
			<Sidebar.MenuItem>
				<div class="flex items-center gap-1">
					<Sidebar.MenuButton
						class="min-h-0 flex-1 rounded-xl bg-transparent data-[slot=sidebar-menu-button]:!p-1.5 hover:bg-sidebar-accent"
					>
						{#snippet child({ props })}
							<a href="/" {...withMobileCloseClick(props)}>
								<span
									class="flex size-10 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-primary md:size-8 md:rounded-lg"
								>
									<UtensilsCrossed class="size-5 md:size-4.5" />
								</span>
								<span class="grid min-w-0 text-left leading-tight">
									<span class="truncate text-[0.95rem] font-semibold md:text-base">
										{m.app_title()}
									</span>
									<span class="text-muted-foreground truncate text-xs md:hidden">
										{m.app_tagline()}
									</span>
								</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
					{#if sidebar.isMobile}
						<Button
							type="button"
							variant="ghost"
							size="icon"
							class="h-10 w-10 shrink-0 rounded-xl"
							onclick={closeMobileSidebar}
						>
							<X class="size-4.5" />
							<span class="sr-only">Close navigation</span>
						</Button>
					{/if}
				</div>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content class="gap-3 px-1 pb-1 md:gap-2 md:px-0 md:pb-0">
		<Sidebar.Group class="p-0 md:p-2">
			<Sidebar.GroupContent>
				<Sidebar.Menu class="gap-1.5 md:gap-1.5">
					{#each navItems as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								isActive={isActive(item.href, $page.url.pathname)}
								tooltipContent={item.title()}
								class={menuButtonClass(item, $page.url.pathname)}
							>
								{#snippet child({ props })}
									<a href={item.href} {...withMobileCloseClick(props)}>
										<span
											class="{item.badgeColor} flex size-8 shrink-0 items-center justify-center rounded-lg"
										>
											<item.icon class="size-4.5 md:size-4" />
										</span>
										<span class="truncate font-semibold">{item.title()}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>
