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
	<Drawer.Root bind:open>
		<Drawer.Content class="data-[vaul-drawer-direction=bottom]:max-h-[85vh]">
			<Drawer.Header class="min-w-0 text-left">
				<Drawer.Title class="truncate">{title}</Drawer.Title>
				{#if description}
					<Drawer.Description class="truncate">{description}</Drawer.Description>
				{/if}
			</Drawer.Header>
			<div class="overflow-y-auto px-4 pb-4" style="min-height: 50vh;">
				{@render children()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
