<script lang="ts">
	import { login } from '$lib/stores/auth.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
	<div class="text-center">
		<h1 class="mb-4 text-5xl font-bold text-gray-900">Bissbilanz</h1>
		<p class="mb-8 text-xl text-gray-600">Track your nutrition with ease</p>
		<Button
			size="lg"
			onclick={login}
			class="bg-indigo-600 hover:bg-indigo-700 text-lg"
		>
			Login with Infomaniak
		</Button>
	</div>
</div>
