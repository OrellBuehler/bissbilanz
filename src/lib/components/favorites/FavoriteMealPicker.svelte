<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
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

	let { open, itemName, mealOptions, onConfirm, onClose }: Props = $props();

	let selectedMeal = $state('');

	$effect(() => {
		if (open) {
			selectedMeal = mealOptions[0] ?? '';
		}
	});

	const handleConfirm = () => {
		if (!selectedMeal) return;
		onConfirm(selectedMeal);
	};

	const handleOpenChange = (value: boolean) => {
		if (!value) {
			onClose();
			selectedMeal = '';
		}
	};
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-[360px]">
		<Dialog.Header>
			<Dialog.Title>{itemName}</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
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
		</div>
		<Dialog.Footer>
			<Button onclick={handleConfirm} disabled={!selectedMeal}>
				<Check class="size-4" />
				{m.favorites_log()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
