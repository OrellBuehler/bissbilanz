<script lang="ts">
	import MacroChip from '$lib/components/shared/MacroChip.svelte';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';

	type Props = {
		name: string;
		imageUrl?: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		type: 'food' | 'recipe';
		onTap: () => void;
	};

	let { name, imageUrl, calories, protein, carbs, fat, type, onTap }: Props = $props();
</script>

<button
	class="overflow-hidden rounded-xl border bg-card shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left w-full"
	onclick={onTap}
>
	<div class="aspect-[4/3] relative overflow-hidden">
		<FoodThumbnail {name} {imageUrl} size="fill" />
	</div>
	<div class="p-2">
		<p class="truncate text-sm font-medium">{name}</p>
		<div class="mt-1 flex flex-wrap gap-1">
			<MacroChip macro="calories" value={calories} />
			<MacroChip macro="protein" value={protein} />
			<MacroChip macro="carbs" value={carbs} />
			<MacroChip macro="fat" value={fat} />
		</div>
	</div>
</button>
