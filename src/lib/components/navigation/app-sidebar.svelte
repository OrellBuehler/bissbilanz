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

	let { ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const navItems = getNavItems();
	const sidebar = useSidebar();

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
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
				<div
					class="relative overflow-hidden rounded-2xl border border-white/60 bg-white/65 p-1 shadow-[0_14px_32px_-20px_rgba(15,23,42,0.4)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:rounded-xl md:border-sidebar-border/60 md:bg-sidebar/80 md:shadow-none"
				>
					<div
						aria-hidden="true"
						class="pointer-events-none absolute inset-0 opacity-75 [background:radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklch,var(--color-sidebar-primary)_18%,transparent)_0%,transparent_55%),radial-gradient(80%_70%_at_100%_10%,color-mix(in_oklch,var(--color-chart-4)_14%,transparent)_0%,transparent_75%)]"
					></div>
					<div class="relative flex items-center gap-1">
						<Sidebar.MenuButton
							class="min-h-0 flex-1 rounded-xl border border-transparent bg-transparent data-[slot=sidebar-menu-button]:!p-1.5 hover:border-white/40 hover:bg-white/55 dark:hover:border-white/10 dark:hover:bg-white/5 md:hover:bg-sidebar-accent md:hover:border-transparent"
						>
							{#snippet child({ props })}
								<a href="/" {...withMobileCloseClick(props)}>
									<span
										class="flex size-10 items-center justify-center rounded-xl border border-white/60 bg-white/70 text-sidebar-primary shadow-sm dark:border-white/10 dark:bg-white/10 md:size-8 md:rounded-lg md:border-sidebar-border/60 md:bg-sidebar md:text-sidebar-foreground md:shadow-none"
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
								class="h-10 w-10 shrink-0 rounded-xl border border-white/50 bg-white/60 shadow-sm hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
								onclick={closeMobileSidebar}
							>
								<X class="size-4.5" />
								<span class="sr-only">Close navigation</span>
							</Button>
						{/if}
					</div>
				</div>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content class="gap-3 px-1 pb-1 md:gap-2 md:px-0 md:pb-0">
		<Sidebar.Group class="p-0 md:p-2">
			<Sidebar.GroupContent
				class="rounded-2xl border border-white/50 bg-white/40 p-1.5 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/8 dark:bg-white/3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none"
			>
				<Sidebar.Menu class="gap-1.5 md:gap-1">
					{#each navItems as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								isActive={isActive(item.href, $page.url.pathname)}
								tooltipContent={item.title()}
								class="h-12 rounded-xl border border-transparent px-3 text-base transition-all duration-200 md:h-8 md:rounded-md md:px-2 md:text-sm data-[active=true]:border-white/60 data-[active=true]:bg-white/75 data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-[0_10px_20px_-16px_rgba(15,23,42,0.55)] hover:border-white/45 hover:bg-white/60 active:scale-[0.995] dark:data-[active=true]:border-white/12 dark:data-[active=true]:bg-white/8 dark:hover:border-white/10 dark:hover:bg-white/6 md:data-[active=true]:border-transparent md:data-[active=true]:bg-sidebar-accent md:data-[active=true]:shadow-none md:hover:border-transparent md:hover:bg-sidebar-accent"
							>
								{#snippet child({ props })}
									<a href={item.href} {...withMobileCloseClick(props)}>
										<span
											class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/40 bg-white/60 text-sidebar-primary shadow-sm dark:border-white/10 dark:bg-white/5 md:size-auto md:rounded-none md:border-0 md:bg-transparent md:text-inherit md:shadow-none"
										>
											<item.icon class="size-4.5 md:size-4" />
										</span>
										<span class="truncate font-medium md:font-normal">{item.title()}</span>
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
