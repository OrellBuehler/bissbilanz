<script lang="ts">
	import { login } from '$lib/stores/auth.svelte';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
	<div class="text-center">
		<h1 class="mb-4 text-5xl font-bold text-gray-900">Bissbilanz</h1>
		<p class="mb-8 text-xl text-gray-600">Track your nutrition with ease</p>
		<button
			onclick={login}
			class="rounded-lg bg-indigo-600 px-6 py-3 text-lg font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
		>
			Login with Infomaniak
		</button>
	</div>
</div>
