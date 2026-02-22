<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		side = 'left',
		variant = 'sidebar',
		collapsible = 'offcanvas',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		side?: 'left' | 'right';
		variant?: 'sidebar' | 'floating' | 'inset';
		collapsible?: 'offcanvas' | 'icon' | 'none';
	} = $props();

	const sidebar = useSidebar();
</script>

{#if collapsible === 'none'}
	<div
		class={cn(
			'bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col',
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
{:else if sidebar.isMobile}
	<Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)} {...restProps}>
		<Sheet.Content
			overlayClass="bg-black/40 backdrop-blur-[2px] supports-[backdrop-filter]:bg-black/20"
			data-sidebar="sidebar"
			data-slot="sidebar"
			data-mobile="true"
			class={cn(
				'text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden',
				'border-sidebar-border/60 bg-sidebar/92 supports-[backdrop-filter]:bg-sidebar/78 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.55)] backdrop-blur-2xl',
				side === 'left' ? 'rounded-r-3xl border-e' : 'rounded-l-3xl border-s'
			)}
			style="--sidebar-width: min(22rem, calc(100vw - 0.75rem));"
			{side}
		>
			<Sheet.Header class="sr-only">
				<Sheet.Title>Sidebar</Sheet.Title>
				<Sheet.Description>Displays the mobile sidebar.</Sheet.Description>
			</Sheet.Header>
			<div class="relative flex h-full w-full flex-col overflow-hidden">
				<div
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(100%_70%_at_0%_0%,color-mix(in_oklch,var(--color-sidebar-primary)_14%,transparent)_0%,transparent_60%),radial-gradient(70%_50%_at_100%_10%,color-mix(in_oklch,var(--color-chart-2)_12%,transparent)_0%,transparent_75%)]"
				></div>
				<div
					class="relative flex h-full w-full flex-col px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
				>
					{@render children?.()}
				</div>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<div
		bind:this={ref}
		class="text-sidebar-foreground group peer hidden md:block"
		data-state={sidebar.state}
		data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
	>
		<!-- This is what handles the sidebar gap on desktop -->
		<div
			data-slot="sidebar-gap"
			class={cn(
				'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
				'group-data-[collapsible=offcanvas]:w-0',
				'group-data-[side=right]:rotate-180',
				variant === 'floating' || variant === 'inset'
					? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
			)}
		></div>
		<div
			data-slot="sidebar-container"
			class={cn(
				'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
				side === 'left'
					? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
					: 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',
				// Adjust the padding for floating and inset variants.
				variant === 'floating' || variant === 'inset'
					? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s',
				className
			)}
			{...restProps}
		>
			<div
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class={cn(
					'bg-sidebar flex h-full w-full flex-col',
					'group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm',
					'group-data-[variant=inset]:border-sidebar-border/70 group-data-[variant=inset]:bg-sidebar/96 group-data-[variant=inset]:supports-[backdrop-filter]:bg-sidebar/88 group-data-[variant=inset]:backdrop-blur-xl group-data-[variant=inset]:shadow-[0_16px_38px_-28px_rgba(15,23,42,0.45)]'
				)}
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
