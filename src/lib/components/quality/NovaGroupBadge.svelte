<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	type Props = {
		group: 1 | 2 | 3 | 4;
	};

	let { group }: Props = $props();

	const config: Record<number, { color: string; label: () => string }> = {
		1: { color: 'bg-green-600 text-white', label: () => m.quality_nova_1() },
		2: { color: 'bg-yellow-500 text-white', label: () => m.quality_nova_2() },
		3: { color: 'bg-orange-500 text-white', label: () => m.quality_nova_3() },
		4: { color: 'bg-red-600 text-white', label: () => m.quality_nova_4() }
	};

	const current = $derived(config[group]);
</script>

<div class="flex items-center gap-2">
	<span
		class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold {current.color}"
	>
		{group}
	</span>
	<span class="text-sm text-muted-foreground">{current.label()}</span>
</div>
