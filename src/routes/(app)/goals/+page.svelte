<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import MacroSliders from '$lib/components/MacroSliders.svelte';
	import { toast } from 'svelte-sonner';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { round2, parseDecimalInput } from '$lib/utils/number';
	import Target from '@lucide/svelte/icons/target';
	import * as m from '$lib/paraglide/messages';

	let form = $state({
		calorieGoal: 2000,
		proteinGoal: 150,
		carbGoal: 220,
		fatGoal: 60,
		fiberGoal: 30
	});
	let targetWeight = $state('');
	let targetDate = $state('');
	let saving = $state(false);
	let macroValid = $state(true);

	const cachedGoals = useLiveQuery(() => goalsService.goals(), undefined);

	$effect(() => {
		goalsService.refresh();
	});

	$effect(() => {
		const g = cachedGoals.value;
		if (g) {
			form.calorieGoal = round2(g.calorieGoal ?? 2000);
			form.proteinGoal = round2(g.proteinGoal ?? 150);
			form.carbGoal = round2(g.carbGoal ?? 220);
			form.fatGoal = round2(g.fatGoal ?? 60);
			form.fiberGoal = round2(g.fiberGoal ?? 30);
			targetWeight = g.targetWeightKg != null ? String(round2(g.targetWeightKg)) : '';
			targetDate = g.targetDate ?? '';
		}
	});

	$effect(() => {
		if (form.fiberGoal > form.carbGoal) {
			form.fiberGoal = form.carbGoal;
		}
	});

	const clearTarget = () => {
		targetWeight = '';
		targetDate = '';
	};

	const saveGoals = async () => {
		const kg = targetWeight.trim() === '' ? null : parseDecimalInput(targetWeight);
		if (kg != null && (isNaN(kg) || kg < 20 || kg > 500)) {
			toast.error(m.error_weight_range());
			return;
		}
		saving = true;
		try {
			const ok = await goalsService.save({
				...form,
				targetWeightKg: kg,
				targetDate: kg == null || targetDate === '' ? null : targetDate
			});
			if (ok) {
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
				onValidChange={(v) => (macroValid = v)}
			/>

			<div class="touch-none space-y-2">
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

			<div class="grid gap-3 border-t pt-6">
				<div class="flex items-center gap-2">
					<div
						class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
					>
						<Target class="size-4" />
					</div>
					<div>
						<p class="text-sm font-medium">{m.goals_weight_target()}</p>
						<p class="text-xs text-muted-foreground">{m.goals_weight_target_desc()}</p>
					</div>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="grid gap-2">
						<Label for="target-weight">{m.goals_target_weight_label()}</Label>
						<Input
							id="target-weight"
							type="number"
							step="0.1"
							min="20"
							max="500"
							placeholder="75.0"
							bind:value={targetWeight}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="target-date">{m.goals_target_date_label()}</Label>
						<Input
							id="target-date"
							type="date"
							bind:value={targetDate}
							disabled={targetWeight.trim() === ''}
						/>
					</div>
				</div>

				{#if targetWeight.trim() !== '' || targetDate !== ''}
					<div>
						<Button variant="ghost" size="sm" onclick={clearTarget}>
							{m.goals_target_clear()}
						</Button>
					</div>
				{/if}
			</div>
		</Card.Content>
		<Card.Footer>
			<Button onclick={saveGoals} disabled={saving || !macroValid}>
				{saving ? m.goals_saving() : m.goals_save()}
			</Button>
		</Card.Footer>
	</Card.Root>
</div>
