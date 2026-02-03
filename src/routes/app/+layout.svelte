<script lang="ts">
	import { logout, setUser } from '$lib/stores/auth.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// Set user in auth store
	$effect(() => {
		setUser(data.user);
	});
</script>

<div class="flex min-h-screen flex-col">
	<header class="bg-white shadow">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
			<h1 class="text-2xl font-bold text-gray-900">Bissbilanz</h1>
			<div class="flex items-center gap-4">
				<span class="text-sm text-gray-600">{data.user.name || data.user.email}</span>
				<button
					onclick={logout}
					class="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
				>
					Logout
				</button>
			</div>
		</div>
	</header>

	<main class="flex-1 bg-gray-50">
		{@render children()}
	</main>
</div>
