<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { dayPropertiesService } from '$lib/services/day-properties-service.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import {
		clampActivityCalories,
		clampWaterMl,
		waterProgressPercent,
		DEFAULT_WATER_GOAL_ML,
		MAX_ACTIVITY_CALORIES,
		MAX_WATER_ML
	} from '$lib/utils/day-properties';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import GlassWater from '@lucide/svelte/icons/glass-water';
	import Flame from '@lucide/svelte/icons/flame';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		onActivityChange?: (activityCalories: number | null) => void;
	};

	let { date, onActivityChange }: Props = $props();

	const propsQuery = useLiveQuery(() => dayPropertiesService.watch(date), undefined);
	const prefsQuery = useLiveQuery(() => preferencesService.preferences(), undefined);

	const stored = $derived(propsQuery.value ?? null);
	const waterGoalMl = $derived(prefsQuery.value?.waterGoalMl ?? DEFAULT_WATER_GOAL_ML);

	const waterMl = $derived(stored?.waterMl ?? 0);
	const waterPercent = $derived(waterProgressPercent(waterMl, waterGoalMl));

	let waterDraft = $state('');
	let activityDraft = $state('');
	let activityNoteDraft = $state('');
	let notesDraft = $state('');
	let notesDirty = $state(false);

	// Server/mirror values are the source of truth; local drafts only exist while
	// a field is being edited, so re-sync them whenever the stored row changes.
	$effect(() => {
		const row = propsQuery.value ?? null;
		waterDraft = row?.waterMl != null ? String(row.waterMl) : '';
		activityDraft = row?.activityCalories != null ? String(row.activityCalories) : '';
		activityNoteDraft = row?.activityNote ?? '';
		if (!notesDirty) notesDraft = row?.notes ?? '';
	});

	$effect(() => {
		onActivityChange?.(stored?.activityCalories ?? null);
	});

	let notesTimer: ReturnType<typeof setTimeout> | null = null;

	const save = (patch: Parameters<typeof dayPropertiesService.update>[1]) =>
		dayPropertiesService.update(date, patch);

	const addWater = (delta: number) => {
		save({ waterMl: clampWaterMl(waterMl + delta) });
	};

	const commitWater = () => {
		const parsed = waterDraft.trim() === '' ? null : Number(waterDraft);
		save({ waterMl: clampWaterMl(parsed) });
	};

	const clearWater = () => save({ waterMl: null });

	const commitActivity = () => {
		const parsed = activityDraft.trim() === '' ? null : Number(activityDraft);
		save({ activityCalories: clampActivityCalories(parsed) });
	};

	const commitActivityNote = () => {
		const trimmed = activityNoteDraft.trim();
		save({ activityNote: trimmed === '' ? null : trimmed.slice(0, 200) });
	};

	const clearActivity = () => save({ activityCalories: null, activityNote: null });

	const commitNotes = () => {
		if (notesTimer) {
			clearTimeout(notesTimer);
			notesTimer = null;
		}
		const trimmed = notesDraft.trim();
		notesDirty = false;
		if (trimmed === (stored?.notes ?? '')) return;
		save({ notes: trimmed === '' ? null : trimmed.slice(0, 2000) });
	};

	const onNotesInput = () => {
		notesDirty = true;
		if (notesTimer) clearTimeout(notesTimer);
		notesTimer = setTimeout(commitNotes, 1200);
	};
</script>

<DashboardCard title={m.day_card_title()} Icon={CalendarDays} tone="neutral">
	<div class="space-y-4">
		<div class="space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<GlassWater class="size-4 text-blue-600 dark:text-blue-400" />
					<span class="text-sm font-medium">{m.day_water_title()}</span>
				</div>
				<span class="text-xs tabular-nums text-muted-foreground">
					{m.day_water_progress({ current: waterMl, goal: waterGoalMl })}
				</span>
			</div>
			<Progress value={waterPercent} class="h-2 bg-blue-500/15 [&>*]:bg-blue-500" />
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

		<div class="space-y-2 border-t border-border/50 pt-4">
			<div class="flex items-center gap-2">
				<Flame class="size-4 text-orange-600 dark:text-orange-400" />
				<span class="text-sm font-medium">{m.day_activity_title()}</span>
			</div>
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
			<p class="text-xs text-muted-foreground">{m.day_activity_informational()}</p>
		</div>

		<div class="space-y-2 border-t border-border/50 pt-4">
			<div class="flex items-center gap-2">
				<NotebookPen class="size-4 text-muted-foreground" />
				<Label class="text-sm font-medium" for="day-notes-input">{m.day_notes_title()}</Label>
			</div>
			<Textarea
				id="day-notes-input"
				rows={3}
				maxlength={2000}
				placeholder={m.day_notes_placeholder()}
				bind:value={notesDraft}
				oninput={onNotesInput}
				onblur={commitNotes}
			/>
		</div>
	</div>
</DashboardCard>
