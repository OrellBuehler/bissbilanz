<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { type Snippet } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		children: Snippet;
	};

	let { open = $bindable(false), title, description, children }: Props = $props();

	const isDesktop = new MediaQuery('(min-width: 768px)');
	const snapPoints = [0.7, 1];
	let activeSnapPoint = $state<number | string | null>(snapPoints[0]);

	$effect(() => {
		if (open) {
			activeSnapPoint = snapPoints[0];
		}
	});

	const isExpanded = $derived(activeSnapPoint === 1);
</script>

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
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
		<Drawer.Content class="data-[vaul-drawer-direction=bottom]:max-h-[100vh]">
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				{#if description}
					<Drawer.Description>{description}</Drawer.Description>
				{/if}
			</Drawer.Header>
			<div class="px-4 pb-4" class:overflow-y-auto={isExpanded} class:overflow-hidden={!isExpanded}>
				{@render children()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
