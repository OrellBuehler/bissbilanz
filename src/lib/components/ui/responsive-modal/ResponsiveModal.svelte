<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { type Snippet } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		openFull?: boolean;
		children: Snippet;
	};

	let { open = $bindable(false), title, description, openFull = false, children }: Props = $props();

	const isDesktop = new MediaQuery('(min-width: 768px)');
	const snapPoints = [0.7, 1];
	let activeSnapPoint = $state<number | string | null>(snapPoints[0]);

	$effect(() => {
		if (open) {
			activeSnapPoint = openFull ? snapPoints[1] : snapPoints[0];
		}
	});

	const isExpanded = $derived(activeSnapPoint === 1);
</script>

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content class="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				{#if description}
					<Dialog.Description>{description}</Dialog.Description>
				{/if}
			</Dialog.Header>
			{@render children()}
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open {snapPoints} bind:activeSnapPoint fadeFromIndex={1}>
		<Drawer.Content
			class="data-[vaul-drawer-direction=bottom]:max-h-[100dvh] {isExpanded ? 'mt-0!' : ''}"
		>
			<Drawer.Header class="min-w-0 text-left">
				<Drawer.Title class="truncate">{title}</Drawer.Title>
				{#if description}
					<Drawer.Description class="truncate">{description}</Drawer.Description>
				{/if}
			</Drawer.Header>
			<div
				class="min-h-[60dvh] min-w-0 px-4 pb-4"
				class:overflow-y-auto={isExpanded}
				class:overflow-hidden={!isExpanded}
			>
				{@render children()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
