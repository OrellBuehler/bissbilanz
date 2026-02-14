<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';

	let form = {
		calorieGoal: 2000,
		proteinGoal: 150,
		carbGoal: 220,
		fatGoal: 60,
		fiberGoal: 30
	};

	const saveGoals = async () => {
		await fetch('/api/goals', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(form)
		});
	};
</script>

<div class="mx-auto max-w-xl space-y-6">
	<Card.Root>
		<Card.Content class="grid gap-4 pt-6">
			<div class="grid gap-2">
				<Label for="calories">{m.goals_calories()}</Label>
				<Input id="calories" type="number" bind:value={form.calorieGoal} />
			</div>
			<div class="grid gap-2">
				<Label for="protein">{m.goals_protein()}</Label>
				<Input id="protein" type="number" bind:value={form.proteinGoal} />
			</div>
			<div class="grid gap-2">
				<Label for="carbs">{m.goals_carbs()}</Label>
				<Input id="carbs" type="number" bind:value={form.carbGoal} />
			</div>
			<div class="grid gap-2">
				<Label for="fat">{m.goals_fat()}</Label>
				<Input id="fat" type="number" bind:value={form.fatGoal} />
			</div>
			<div class="grid gap-2">
				<Label for="fiber">{m.goals_fiber()}</Label>
				<Input id="fiber" type="number" bind:value={form.fiberGoal} />
			</div>
		</Card.Content>
		<Card.Footer>
			<Button onclick={saveGoals}>{m.goals_save()}</Button>
		</Card.Footer>
	</Card.Root>
</div>
