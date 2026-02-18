<script lang="ts">
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

	const PALETTE = [
		{ bg: 'bg-rose-200', text: 'text-rose-700' },
		{ bg: 'bg-sky-200', text: 'text-sky-700' },
		{ bg: 'bg-amber-200', text: 'text-amber-700' },
		{ bg: 'bg-emerald-200', text: 'text-emerald-700' },
		{ bg: 'bg-violet-200', text: 'text-violet-700' },
		{ bg: 'bg-orange-200', text: 'text-orange-700' },
		{ bg: 'bg-teal-200', text: 'text-teal-700' },
		{ bg: 'bg-pink-200', text: 'text-pink-700' }
	];

	const colorIndex = $derived(
		name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTE.length
	);
	const placeholderColor = $derived(PALETTE[colorIndex]);
	const initial = $derived(name.charAt(0).toUpperCase());
</script>

<button
	class="overflow-hidden rounded-xl border bg-card shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left w-full"
	onclick={onTap}
>
	<div class="aspect-[4/3] relative overflow-hidden">
		{#if imageUrl}
			<img
				src={imageUrl}
				alt={name}
				class="h-full w-full object-cover"
				loading="lazy"
			/>
		{:else}
			<div
				class="flex h-full w-full items-center justify-center {placeholderColor.bg}"
			>
				<span class="text-4xl font-bold {placeholderColor.text}">{initial}</span>
			</div>
		{/if}
	</div>
	<div class="p-2">
		<p class="truncate text-sm font-medium">{name}</p>
		<div class="mt-1 flex flex-wrap gap-1">
			<span class="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{Math.round(calories)} kcal</span>
			<span class="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">{protein.toFixed(1)}g P</span>
			<span class="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{carbs.toFixed(1)}g C</span>
			<span class="inline-flex items-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">{fat.toFixed(1)}g F</span>
		</div>
	</div>
</button>
