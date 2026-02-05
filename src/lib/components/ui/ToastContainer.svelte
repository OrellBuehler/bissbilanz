<script lang="ts">
	import Toast from './Toast.svelte';
	import { getToasts, removeToast } from '$lib/stores/toast.svelte';

	const toasts = $derived(getToasts());
</script>

<div class="fixed bottom-4 right-4 z-50 space-y-2">
	{#each toasts as toast (toast.id)}
		<Toast message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
	{/each}
</div>
