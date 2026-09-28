<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import {
		clampWaterMl,
		waterProgressPercent,
		DEFAULT_WATER_GOAL_ML,
		MAX_WATER_ML
	} from '$lib/utils/day-properties';
	import { inputText } from '$lib/utils/number';
	import GlassWater from '@lucide/svelte/icons/glass-water';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	let { date }: { date: string } = $props();

	const propsQuery = useLiveQuery(() => dayPropertiesService.watch(date), undefined);
	const prefsQuery = useLiveQuery(() => preferencesService.preferences(), undefined);

	const stored = $derived(propsQuery.value ?? null);
	const waterGoalMl = $derived(prefsQuery.value?.waterGoalMl ?? DEFAULT_WATER_GOAL_ML);

	const waterMl = $derived(stored?.waterMl ?? 0);
	const waterPercent = $derived(waterProgressPercent(waterMl, waterGoalMl));

	let waterDraft = $state('');
	let waterDirty = $state(false);

	// Server/mirror values are the source of truth; the draft only diverges while
	// the field is being edited, so a background refresh must not overwrite it.
	$effect(() => {
		const row = propsQuery.value ?? null;
		if (!waterDirty) waterDraft = row?.waterMl != null ? String(row.waterMl) : '';
	});

	const save = (patch: Parameters<typeof dayPropertiesService.update>[1]) =>
		dayPropertiesService.update(date, patch);

	const draftWater = () => {
		const text = inputText(waterDraft);
		const parsed = text === '' ? null : Number(text);
		return parsed != null && Number.isFinite(parsed) ? clampWaterMl(parsed) : null;
	};

	// Base the increment on the visible draft, not the stored row: a value typed
	// a moment ago may not have landed in the mirror yet when the button fires.
	const addWater = (delta: number) => {
		waterDirty = false;
		const base = draftWater() ?? waterMl;
		const next = clampWaterMl(base + delta);
		waterDraft = next != null ? String(next) : '';
		save({ waterMl: next });
	};

	const commitWater = () => {
		waterDirty = false;
		const next = draftWater();
		if (next === (stored?.waterMl ?? null)) return;
		save({ waterMl: next });
	};

	const clearWater = () => {
		waterDirty = false;
		waterDraft = '';
		save({ waterMl: null });
	};
</script>

{#snippet waterProgress()}
	<span class="text-xs tabular-nums text-muted-foreground">
		{m.day_water_progress({ current: waterMl, goal: waterGoalMl })}
	</span>
{/snippet}

<DashboardCard
	title={m.day_water_title()}
	Icon={GlassWater}
	tone="neutral"
	headerRight={waterProgress}
>
	<div class="space-y-2">
		<Progress
			value={waterPercent}
			class="h-2 bg-cyan-500/15 [&>[data-slot=progress-indicator]]:bg-cyan-500"
		/>
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" size="sm" onclick={() => addWater(250)}>
				{m.day_water_add({ amount: 250 })}
			</Button>
			<Button variant="outline" size="sm" onclick={() => addWater(500)}>
				{m.day_water_add({ amount: 500 })}
			</Button>
			<div class="flex items-center gap-1.5">
				<Label class="sr-only" for="day-water-input">{m.day_water_input_label()}</Label>
				<Input
					id="day-water-input"
					type="number"
					inputmode="numeric"
					min="0"
					max={MAX_WATER_ML}
					step="50"
					class="h-9 w-24"
					bind:value={waterDraft}
					oninput={() => (waterDirty = true)}
					onblur={commitWater}
					onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && commitWater()}
				/>
				<span class="text-xs text-muted-foreground">{m.day_unit_ml()}</span>
			</div>
			{#if waterMl > 0}
				<Button
					variant="ghost"
					size="icon"
					class="size-9"
					aria-label={m.day_water_clear()}
					onclick={clearWater}
				>
					<X class="size-4" />
				</Button>
			{/if}
		</div>
	</div>
</DashboardCard>
