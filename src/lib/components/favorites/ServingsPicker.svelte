<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		itemName: string;
		onConfirm: (servings: number) => void;
		onClose: () => void;
	};

	let { open = $bindable(), itemName, onConfirm, onClose }: Props = $props();

	let servings = $state(1);

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
			servings = 1;
		}
		wasOpen = open;
	});

	const handleConfirm = () => {
		onConfirm(servings);
		servings = 1;
	};
</script>

<ResponsiveModal bind:open title={itemName}>
	<div class="grid gap-4">
		<div class="grid gap-2">
			<Label for="servings">{m.favorites_servings()}</Label>
			<Input id="servings" type="number" bind:value={servings} min={0.25} step={0.25} />
		</div>
		<Button onclick={handleConfirm}>
			<Check class="size-4" />
			{m.favorites_log()}
		</Button>
	</div>
</ResponsiveModal>
