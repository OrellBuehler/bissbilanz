<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import { clampActivityCalories, MAX_ACTIVITY_CALORIES } from '$lib/utils/day-properties';
	import { inputText } from '$lib/utils/number';
	import Flame from '@lucide/svelte/icons/flame';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	let { date }: { date: string } = $props();

	const propsQuery = useLiveQuery(() => dayPropertiesService.watch(date), undefined);

	const stored = $derived(propsQuery.value ?? null);

	const activitySourceLabel = $derived.by(() => {
		if (stored?.activityCaloriesSource === 'apple_health')
			return m.day_properties_activity_source_apple_health();
		if (stored?.activityCaloriesSource === 'health_connect')
			return m.day_properties_activity_source_health_connect();
		return null;
	});

	let activityDraft = $state('');
	let activityDirty = $state(false);
	let activityNoteDraft = $state('');
	let activityNoteDirty = $state(false);

	// Server/mirror values are the source of truth; drafts only diverge while a
	// field is being edited, so a background refresh must not overwrite them.
	$effect(() => {
		const row = propsQuery.value ?? null;
		if (!activityDirty)
			activityDraft = row?.activityCalories != null ? String(row.activityCalories) : '';
		if (!activityNoteDirty) activityNoteDraft = row?.activityNote ?? '';
	});

	const save = (patch: Parameters<typeof dayPropertiesService.update>[1]) =>
		dayPropertiesService.update(date, patch);

	const commitActivity = () => {
		activityDirty = false;
		const text = inputText(activityDraft);
		const parsed = text === '' ? null : Number(text);
		const next = parsed != null && Number.isFinite(parsed) ? clampActivityCalories(parsed) : null;
		if (next === (stored?.activityCalories ?? null)) return;
		save({ activityCalories: next });
	};

	const commitActivityNote = () => {
		activityNoteDirty = false;
		const trimmed = activityNoteDraft.trim();
		const next = trimmed === '' ? null : trimmed.slice(0, 200);
		if (next === (stored?.activityNote ?? null)) return;
		save({ activityNote: next });
	};

	const clearActivity = () => {
		activityDirty = false;
		activityNoteDirty = false;
		activityDraft = '';
		activityNoteDraft = '';
		save({ activityCalories: null, activityNote: null });
	};
</script>

<DashboardCard title={m.day_activity_title()} Icon={Flame} tone="neutral">
	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-2">
			<div class="flex items-center gap-1.5">
				<Label class="sr-only" for="day-activity-input">{m.day_activity_input_label()}</Label>
				<Input
					id="day-activity-input"
					type="number"
					inputmode="numeric"
					min="0"
					max={MAX_ACTIVITY_CALORIES}
					step="10"
					class="h-9 w-24"
					placeholder="0"
					bind:value={activityDraft}
					oninput={() => (activityDirty = true)}
					onblur={commitActivity}
					onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && commitActivity()}
				/>
				<span class="text-xs text-muted-foreground">{m.foods_kcal()}</span>
			</div>
			<Input
				class="h-9 min-w-40 flex-1"
				maxlength={200}
				placeholder={m.day_activity_note_placeholder()}
				aria-label={m.day_activity_note_placeholder()}
				bind:value={activityNoteDraft}
				oninput={() => (activityNoteDirty = true)}
				onblur={commitActivityNote}
			/>
			{#if stored?.activityCalories != null || stored?.activityNote}
				<Button
					variant="ghost"
					size="icon"
					class="size-9"
					aria-label={m.day_activity_clear()}
					onclick={clearActivity}
				>
					<X class="size-4" />
				</Button>
			{/if}
		</div>
		{#if activitySourceLabel}
			<p class="flex items-center gap-1 text-xs text-muted-foreground">
				<HeartPulse class="size-3.5" />
				{activitySourceLabel}
			</p>
		{/if}
		<p class="text-xs text-muted-foreground">{m.day_activity_informational()}</p>
	</div>
</DashboardCard>
