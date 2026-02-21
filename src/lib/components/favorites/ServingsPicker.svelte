<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		itemName: string;
		onConfirm: (servings: number) => void;
		onClose: () => void;
	};

	let { open, itemName, onConfirm, onClose }: Props = $props();

	let servings = $state(1);

	const handleConfirm = () => {
		onConfirm(servings);
		servings = 1;
	};

	const handleOpenChange = (value: boolean) => {
		if (!value) {
			onClose();
			servings = 1;
		}
	};
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-[340px]">
		<Dialog.Header>
			<Dialog.Title>{itemName}</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<Label for="servings">{m.favorites_servings()}</Label>
				<Input
					id="servings"
					type="number"
					bind:value={servings}
					min={0.25}
					step={0.25}
				/>
			</div>
		</div>
		<Dialog.Footer>
			<Button onclick={handleConfirm}>{m.favorites_log()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
