<script lang="ts">
	import { logout, setUser } from '$lib/stores/auth.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { LayoutData } from './$types';
	import * as m from '$lib/paraglide/messages';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// Set user in auth store
	$effect(() => {
		setUser(data.user);
	});
</script>

<div class="flex min-h-screen flex-col">
	<header class="bg-background border-b">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
			<h1 class="text-2xl font-bold">{m.app_title()}</h1>
			<div class="flex items-center gap-4">
				<span class="text-sm text-muted-foreground">{data.user.name || data.user.email}</span>
				<Button variant="destructive" size="sm" onclick={logout}>
					{m.auth_logout()}
				</Button>
			</div>
		</div>
	</header>

	<main class="flex-1 bg-muted/40">
		{@render children()}
	</main>
</div>
