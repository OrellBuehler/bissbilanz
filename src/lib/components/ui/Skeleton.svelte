<script lang="ts">
	type Props = {
		class?: string;
	};

	let { class: className = '' }: Props = $props();
</script>

<div class={`animate-pulse rounded bg-neutral-200 ${className}`}></div>
