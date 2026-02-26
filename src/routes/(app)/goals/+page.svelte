<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { toast } from 'svelte-sonner';
	import { apiFetch } from '$lib/utils/api';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	let form = $state({
		calorieGoal: 2000,
		proteinGoal: 150,
		carbGoal: 220,
		fatGoal: 60,
		fiberGoal: 30
	});
	let saving = $state(false);
	let loaded = $state(false);

	onMount(async () => {
		const res = await fetch('/api/goals');
		if (res.ok) {
			const data = await res.json();
			if (data.goals) {
				form.calorieGoal = data.goals.calorieGoal ?? 2000;
				form.proteinGoal = data.goals.proteinGoal ?? 150;
				form.carbGoal = data.goals.carbGoal ?? 220;
				form.fatGoal = data.goals.fatGoal ?? 60;
				form.fiberGoal = data.goals.fiberGoal ?? 30;
			}
		}
		loaded = true;
	});

	const saveGoals = async () => {
		saving = true;
		try {
			const res = await apiFetch('/api/goals', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(form)
			});
			if (res.ok) {
				toast.success(m.goals_saved());
			} else {
				toast.error(m.goals_save_failed());
			}
		} catch {
			toast.error(m.goals_save_failed());
		} finally {
			saving = false;
		}
	};
</script>

{#if loaded}
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
				<Button onclick={saveGoals} disabled={saving}>
					{saving ? m.goals_saving() : m.goals_save()}
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
