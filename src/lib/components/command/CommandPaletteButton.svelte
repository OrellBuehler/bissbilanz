<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { commandPalette } from '$lib/stores/command-palette.svelte';
	import * as m from '$lib/paraglide/messages';
	import Search from '@lucide/svelte/icons/search';

	type Props = { compact?: boolean };

	let { compact = false }: Props = $props();

	const isApple =
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');
</script>

{#if compact}
	<Button
		variant="ghost"
		size="icon"
		class="size-9 shrink-0"
		aria-label={m.command_open()}
		onclick={() => (commandPalette.open = true)}
	>
		<Search class="size-5" />
	</Button>
{:else}
	<Button
		variant="outline"
		size="sm"
		class="text-muted-foreground w-56 justify-start gap-2 font-normal"
		onclick={() => (commandPalette.open = true)}
	>
		<Search class="size-4" />
		<span>{m.command_open()}</span>
		<kbd
			class="bg-muted text-muted-foreground ms-auto rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium"
		>
			{isApple ? '⌘K' : 'Ctrl K'}
		</kbd>
	</Button>
{/if}
