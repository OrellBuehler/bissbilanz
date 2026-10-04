<script lang="ts">
	import { qrPath } from '$lib/mcp-connect';

	let {
		value,
		label,
		class: className = ''
	}: { value: string; label: string; class?: string } = $props();

	const qr = $derived(qrPath(value));
	const quietZone = 2;
</script>

<svg
	role="img"
	aria-label={label}
	viewBox="{-quietZone} {-quietZone} {qr.size + quietZone * 2} {qr.size + quietZone * 2}"
	shape-rendering="crispEdges"
	class={className}
>
	<rect
		x={-quietZone}
		y={-quietZone}
		width={qr.size + quietZone * 2}
		height={qr.size + quietZone * 2}
		fill="#fff"
	/>
	<path d={qr.path} fill="#000" />
</svg>
