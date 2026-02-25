<script lang="ts">
	type Props = {
		score: 'a' | 'b' | 'c' | 'd' | 'e';
		compact?: boolean;
	};

	let { score, compact = false }: Props = $props();

	const grades = ['a', 'b', 'c', 'd', 'e'] as const;

	const colors: Record<string, { active: string; inactive: string }> = {
		a: { active: 'bg-green-600 text-white', inactive: 'bg-green-100 text-green-300' },
		b: { active: 'bg-lime-500 text-white', inactive: 'bg-lime-100 text-lime-300' },
		c: { active: 'bg-yellow-400 text-white', inactive: 'bg-yellow-100 text-yellow-300' },
		d: { active: 'bg-orange-500 text-white', inactive: 'bg-orange-100 text-orange-300' },
		e: { active: 'bg-red-600 text-white', inactive: 'bg-red-100 text-red-300' }
	};
</script>

{#if compact}
	<span
		class="flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold uppercase {colors[
			score
		].active}"
	>
		{score}
	</span>
{:else}
	<div class="flex gap-0.5">
		{#each grades as grade}
			{@const isActive = grade === score}
			<span
				class="flex items-center justify-center rounded text-xs font-bold uppercase {isActive
					? `${colors[grade].active} h-7 w-7`
					: `${colors[grade].inactive} h-5 w-5 text-[10px]`}"
				class:scale-110={isActive}
			>
				{grade}
			</span>
		{/each}
	</div>
{/if}
