<script lang="ts">
	type Props = {
		message: string;
		type?: 'success' | 'error' | 'info';
		onClose?: () => void;
	};

	let { message, type = 'info', onClose }: Props = $props();

	const colors = {
		success: 'bg-green-500',
		error: 'bg-red-500',
		info: 'bg-blue-500'
	};
</script>

<div
	class={`fixed bottom-4 right-4 z-50 rounded px-4 py-2 text-white shadow-lg ${colors[type]}`}
	role="alert"
>
	<div class="flex items-center gap-2">
		<span>{message}</span>
		{#if onClose}
			<button onclick={onClose} class="ml-2 hover:opacity-80">×</button>
		{/if}
	</div>
</div>
