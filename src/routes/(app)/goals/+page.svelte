<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import MacroSliders from '$lib/components/MacroSliders.svelte';
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

	$effect(() => {
		if (form.fiberGoal > form.carbGoal) {
			form.fiberGoal = form.carbGoal;
		}
	});

	onMount(async () => {
		const res = await fetch('/api/goals');
		if (res.ok) {
			const data = await res.json();
			if (data.goals) {
				form.calorieGoal = round2(data.goals.calorieGoal ?? 2000);
				form.proteinGoal = round2(data.goals.proteinGoal ?? 150);
				form.carbGoal = round2(data.goals.carbGoal ?? 220);
				form.fatGoal = round2(data.goals.fatGoal ?? 60);
				form.fiberGoal = round2(data.goals.fiberGoal ?? 30);
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
			<Card.Content class="grid gap-6 pt-6">
				<div class="grid gap-2">
					<Label for="calories">{m.goals_calories()}</Label>
					<Input id="calories" type="number" bind:value={form.calorieGoal} />
				</div>

				<MacroSliders
					calorieGoal={form.calorieGoal}
					bind:proteinGoal={form.proteinGoal}
					bind:carbGoal={form.carbGoal}
					bind:fatGoal={form.fatGoal}
				/>

				<div class="space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-green-500">{m.goals_fiber()}</span>
						<span class="text-muted-foreground">{form.fiberGoal}g</span>
					</div>
					<Slider
						type="single"
						value={form.fiberGoal}
						min={0}
						max={form.carbGoal}
						step={1}
						class="[&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500"
						onValueChange={(v: number) => (form.fiberGoal = v)}
					/>
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
