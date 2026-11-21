<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		urls: string[];
		open: boolean;
		index: number;
	};

	let { urls, open = $bindable(false), index = $bindable(0) }: Props = $props();

	const label = $derived(
		m.ai_tasks_photo_index({ index: String(index + 1), count: String(urls.length) })
	);

	const step = (delta: number) => {
		index = (index + delta + urls.length) % urls.length;
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (urls.length < 2) return;
		if (event.key === 'ArrowLeft') step(-1);
		if (event.key === 'ArrowRight') step(1);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl" onkeydown={onKeydown}>
		<Dialog.Header>
			<Dialog.Title>{label}</Dialog.Title>
		</Dialog.Header>
		{#if urls[index]}
			<img src={urls[index]} alt={label} class="max-h-[65dvh] w-full rounded-md object-contain" />
		{/if}
		{#if urls.length > 1}
			<div class="flex items-center justify-between">
				<Button
					variant="outline"
					size="icon"
					onclick={() => step(-1)}
					aria-label={m.ai_tasks_photo_previous()}
				>
					<ChevronLeft class="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onclick={() => step(1)}
					aria-label={m.ai_tasks_photo_next()}
				>
					<ChevronRight class="size-4" />
				</Button>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
