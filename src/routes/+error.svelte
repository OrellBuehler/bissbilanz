<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
	<TriangleAlert class="h-12 w-12 text-muted-foreground" />
	<h1 class="text-2xl font-semibold">
		{$page.status === 404 ? m.error_page_not_found() : m.error_page_title()}
	</h1>
	<p class="max-w-md text-sm text-muted-foreground">
		{m.error_page_message()}
	</p>
	{#if $page.status !== 404 && $page.error?.message}
		<p class="text-xs text-muted-foreground/70">{$page.status}: {$page.error.message}</p>
	{/if}
	<Button href="/home">{m.error_page_home()}</Button>
</div>
