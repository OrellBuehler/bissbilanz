<script lang="ts">
	type Grade = 'a' | 'b' | 'c' | 'd' | 'e';

	type Props = {
		value: Grade | null;
		onchange: (v: Grade | null) => void;
	};

	let { value, onchange }: Props = $props();

	const grades: Grade[] = ['a', 'b', 'c', 'd', 'e'];

	const colors: Record<Grade, { active: string; inactive: string }> = {
		a: { active: 'bg-green-600 text-white', inactive: 'bg-green-100 text-green-300' },
		b: { active: 'bg-lime-500 text-white', inactive: 'bg-lime-100 text-lime-300' },
		c: { active: 'bg-yellow-400 text-white', inactive: 'bg-yellow-100 text-yellow-300' },
		d: { active: 'bg-orange-500 text-white', inactive: 'bg-orange-100 text-orange-300' },
		e: { active: 'bg-red-600 text-white', inactive: 'bg-red-100 text-red-300' }
	};

	function select(grade: Grade) {
		onchange(value === grade ? null : grade);
	}
</script>

<div class="flex gap-1">
	{#each grades as grade}
		{@const isActive = grade === value}
		<button
			type="button"
			onclick={() => select(grade)}
			class="flex items-center justify-center rounded text-xs font-bold uppercase transition-transform {isActive
				? `${colors[grade].active} h-8 w-8 scale-110`
				: `${colors[grade].inactive} h-6 w-6 hover:scale-105`}"
		>
			{grade}
		</button>
	{/each}
</div>
