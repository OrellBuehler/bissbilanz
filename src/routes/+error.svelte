<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { reportErrorPageShown } from '$lib/utils/server-failure';
	import * as m from '$lib/paraglide/messages';

	const unreachable = $derived([502, 503, 504].includes(page.status));

	$effect(() => {
		reportErrorPageShown(page.status, page.url.pathname);
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
	<TriangleAlert class="h-12 w-12 text-muted-foreground" />
	<h1 class="text-2xl font-semibold">
		{#if page.status === 404}
			{m.error_page_not_found()}
		{:else if unreachable}
			{m.error_page_unreachable_title()}
		{:else}
			{m.error_page_title()}
		{/if}
	</h1>
	<p class="max-w-md text-sm text-muted-foreground">
		{unreachable ? m.error_page_unreachable_message() : m.error_page_message()}
	</p>
	{#if page.status !== 404 && page.error?.message}
		<p class="text-xs text-muted-foreground/70">{page.status}: {page.error.message}</p>
	{/if}
	<div class="flex flex-wrap justify-center gap-2">
		{#if unreachable}
			<Button onclick={() => location.reload()}>
				<RefreshCw />
				{m.error_page_retry()}
			</Button>
		{/if}
		<Button href="/home" variant={unreachable ? 'outline' : 'default'}>{m.error_page_home()}</Button
		>
	</div>
</div>
