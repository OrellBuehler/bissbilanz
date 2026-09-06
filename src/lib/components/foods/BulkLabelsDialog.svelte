<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import FoodLabelsInput from '$lib/components/foods/FoodLabelsInput.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { BulkLabelMode } from '$lib/components/foods/bulkActions';

	type Props = {
		open: boolean;
		count: number;
		onApply: (mode: BulkLabelMode, labels: string[]) => void;
	};

	let { open = $bindable(false), count, onApply }: Props = $props();

	let mode = $state<BulkLabelMode>('add_labels');
	let labels = $state<string[]>([]);

	const modes: Array<{ value: BulkLabelMode; label: () => string }> = [
		{ value: 'add_labels', label: m.foods_bulk_labels_mode_add },
		{ value: 'remove_labels', label: m.foods_bulk_labels_mode_remove },
		{ value: 'set_labels', label: m.foods_bulk_labels_mode_set }
	];

	// "Replace" with an empty list is a deliberate clear; the other two modes
	// would be a no-op, so they stay disabled until something is typed.
	const canApply = $derived(mode === 'set_labels' || labels.length > 0);

	$effect(() => {
		if (open) {
			mode = 'add_labels';
			labels = [];
		}
	});
</script>

<ResponsiveModal
	bind:open
	title={m.foods_bulk_labels_title({ count })}
	description={m.foods_bulk_labels_description()}
>
	<div class="space-y-4">
		<div class="grid gap-1.5">
			<Label>{m.foods_bulk_labels_mode()}</Label>
			<div class="flex flex-wrap gap-2">
				{#each modes as option (option.value)}
					<Button
						type="button"
						size="sm"
						variant={mode === option.value ? 'default' : 'outline'}
						aria-pressed={mode === option.value}
						onclick={() => (mode = option.value)}
					>
						{option.label()}
					</Button>
				{/each}
			</div>
		</div>

		<FoodLabelsInput {labels} onChange={(next) => (labels = next)} />

		<Button class="w-full" disabled={!canApply} onclick={() => onApply(mode, labels)}>
			{m.foods_bulk_labels_apply()}
		</Button>
	</div>
</ResponsiveModal>
