<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		itemName: string;
		mealOptions: string[];
		onConfirm: (mealType: string) => void;
		onClose: () => void;
	};

	let { open = $bindable(), itemName, mealOptions, onConfirm, onClose }: Props = $props();

	let selectedMeal = $state('');

	$effect(() => {
		if (open) {
			selectedMeal = mealOptions[0] ?? '';
		}
	});

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
			selectedMeal = '';
		}
		wasOpen = open;
	});

	const handleConfirm = () => {
		if (!selectedMeal) return;
		onConfirm(selectedMeal);
	};
</script>

<ResponsiveModal bind:open title={itemName}>
	<div class="grid gap-4">
		<div class="grid gap-2">
			<Label>{m.edit_entry_meal()}</Label>
			<Select.Root type="single" bind:value={selectedMeal}>
				<Select.Trigger>
					{selectedMeal || m.edit_entry_select_meal()}
				</Select.Trigger>
				<Select.Content>
					{#each mealOptions as meal}
						<Select.Item value={meal}>{meal}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<Button onclick={handleConfirm} disabled={!selectedMeal}>
			<Check class="size-4" />
			{m.favorites_log()}
		</Button>
	</div>
</ResponsiveModal>
