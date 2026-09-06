<script lang="ts">
	type Props = { progress: number; size?: number };
	let { progress, size = 224 }: Props = $props();

	const stroke = 14;
	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const offset = $derived(circumference * (1 - Math.min(1, Math.max(0, progress))));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	class="max-w-full"
	role="presentation"
	aria-hidden="true"
>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={radius}
		fill="none"
		stroke-width={stroke}
		class="stroke-indigo-500/15"
	/>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={radius}
		fill="none"
		stroke-width={stroke}
		stroke-linecap="round"
		stroke-dasharray={circumference}
		stroke-dashoffset={offset}
		transform="rotate(-90 {size / 2} {size / 2})"
		class="stroke-indigo-500 transition-[stroke-dashoffset] duration-500 dark:stroke-indigo-400"
	/>
</svg>
