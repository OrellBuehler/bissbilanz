<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import * as m from '$lib/paraglide/messages';

	let mealTypes: Array<{ id: string; name: string; sortOrder: number }> = [];
	let newName = '';

	const loadMealTypes = async () => {
		const res = await fetch('/api/meal-types');
		mealTypes = (await res.json()).mealTypes;
	};

	const addMealType = async () => {
		if (!newName.trim()) return;
		await fetch('/api/meal-types', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName, sortOrder: mealTypes.length + 1 })
		});
		newName = '';
		await loadMealTypes();
	};

	const removeMealType = async (id: string) => {
		await fetch(`/api/meal-types/${id}`, { method: 'DELETE' });
		await loadMealTypes();
	};

	onMount(() => {
		loadMealTypes();
	});
</script>

<div class="mx-auto max-w-2xl space-y-6">

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_language()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<LanguageSwitcher />
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_custom_meals()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex gap-2">
				<Input
					class="flex-1"
					placeholder={m.settings_add_meal_placeholder()}
					bind:value={newName}
					onkeydown={(e) => e.key === 'Enter' && addMealType()}
				/>
				<Button onclick={addMealType}>{m.settings_add()}</Button>
			</div>
			<ul class="space-y-2">
				{#each mealTypes as meal}
					<li class="flex items-center justify-between rounded-md border p-2">
						<span>{meal.name}</span>
						<Button variant="outline" size="sm" onclick={() => removeMealType(meal.id)}>
							{m.settings_remove()}
						</Button>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
</div>
