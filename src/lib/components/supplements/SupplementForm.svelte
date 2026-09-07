<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import { dosageUnitValues } from '$lib/supplement-units';
	import { today } from '$lib/utils/dates';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Check from '@lucide/svelte/icons/check';
	import { round2 } from '$lib/utils/number';
	import { parseDosage as parseDosageRaw } from '$lib/utils/supplements';
	import * as m from '$lib/paraglide/messages';

	import type { ScheduleType } from '$lib/supplement-units';

	type IngredientInput = {
		/** Existing backing food id (if reusing a previously created supplement food) */
		foodId?: string;
		/** Display name (used to build the backing food on submit) */
		name: string;
		/** Dosage amount; stored on the backing food's ingredients_text for reference */
		dosage: number;
		/** Dosage unit (mg, mcg, IU, etc.) */
		dosageUnit: string;
		/**
		 * Original ingredients_text when it couldn't be parsed as "<number> <unit>".
		 * Preserved verbatim on round-trip so richer free-form labels aren't lost.
		 */
		originalText?: string;
	};

	/** Inline food payload sent per ingredient — backend creates a backing food with kind='supplement'. */
	type InlineFoodPayload = {
		name: string;
		servingSize: number;
		servingUnit: 'g';
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		ingredientsText: string;
	};

	export type SupplementPayload = {
		name: string;
		scheduleType: ScheduleType;
		scheduleDays?: number[];
		scheduleStartDate?: string;
		timeOfDay?: 'morning' | 'noon' | 'evening' | null;
		/** Local wall-clock 'HH:MM' reminder times; only the mobile apps notify. */
		reminderTimes?: string[];
		ingredients: {
			foodId?: string;
			food?: InlineFoodPayload;
			servings?: number;
			sortOrder: number;
		}[];
	};

	type ExistingIngredient = {
		foodId: string;
		servings: number;
		food: { name: string; ingredientsText?: string | null };
	};

	type SupplementWithIngredients = {
		id: string;
		name: string;
		scheduleType: string;
		scheduleDays: number[] | null;
		scheduleStartDate: string | null;
		timeOfDay: string | null;
		reminderTimes?: string[] | null;
		ingredients?: ExistingIngredient[];
	};

	let {
		supplement,
		onSave,
		onCancel
	}: {
		supplement?: SupplementWithIngredients | null;
		onSave: (payload: SupplementPayload) => void;
		onCancel: () => void;
	} = $props();

	const parseDosage = (text: string | null | undefined) => {
		const parsed = parseDosageRaw(text);
		return { ...parsed, dosage: round2(parsed.dosage) };
	};

	// svelte-ignore state_referenced_locally
	let name = $state(supplement?.name ?? '');
	// svelte-ignore state_referenced_locally
	let scheduleType: ScheduleType = $state((supplement?.scheduleType as ScheduleType) ?? 'daily');
	// svelte-ignore state_referenced_locally
	let scheduleDays = $state<number[]>(supplement?.scheduleDays ?? []);
	// svelte-ignore state_referenced_locally
	let scheduleStartDate = $state(supplement?.scheduleStartDate ?? today());
	// svelte-ignore state_referenced_locally
	let timeOfDay = $state<'morning' | 'noon' | 'evening' | null>(
		(supplement?.timeOfDay as 'morning' | 'noon' | 'evening' | null) ?? null
	);

	// svelte-ignore state_referenced_locally
	let reminderTimes = $state<string[]>(supplement?.reminderTimes ?? []);

	// svelte-ignore state_referenced_locally
	let ingredients = $state<IngredientInput[]>(
		(supplement?.ingredients ?? []).map((i) => {
			const parsed = parseDosage(i.food.ingredientsText);
			return {
				foodId: i.foodId,
				name: i.food.name,
				dosage: parsed.dosage,
				dosageUnit: parsed.unit,
				originalText: parsed.parsed ? undefined : (i.food.ingredientsText ?? undefined)
			};
		})
	);

	// Always start with at least one ingredient row; supplements must have one.
	$effect(() => {
		if (ingredients.length === 0) {
			ingredients = [{ name: '', dosage: 0, dosageUnit: 'mg' }];
		}
	});

	const dosageUnits = dosageUnitValues;
	const scheduleTypes = [
		{ value: 'daily', label: () => m.supplements_schedule_daily() },
		{ value: 'every_other_day', label: () => m.supplements_schedule_every_other_day() },
		{ value: 'weekly', label: () => m.supplements_schedule_weekly() },
		{ value: 'specific_days', label: () => m.supplements_schedule_specific_days() }
	];
	const timeOfDayOptions = [
		{ value: 'morning', label: () => m.supplements_time_morning() },
		{ value: 'noon', label: () => m.supplements_time_noon() },
		{ value: 'evening', label: () => m.supplements_time_evening() },
		{ value: '', label: () => m.supplements_time_anytime() }
	];

	const dayLabels = [
		m.supplements_day_sun,
		m.supplements_day_mon,
		m.supplements_day_tue,
		m.supplements_day_wed,
		m.supplements_day_thu,
		m.supplements_day_fri,
		m.supplements_day_sat
	];

	const toggleDay = (day: number) => {
		if (scheduleDays.includes(day)) {
			scheduleDays = scheduleDays.filter((d) => d !== day);
		} else {
			scheduleDays = [...scheduleDays, day].sort();
		}
	};

	const addIngredient = () => {
		ingredients = [...ingredients, { name: '', dosage: 0, dosageUnit: 'mg' }];
	};

	const removeIngredient = (index: number) => {
		if (ingredients.length <= 1) return;
		ingredients = ingredients.filter((_, i) => i !== index);
	};

	const MAX_REMINDERS = 6;

	// Browser-side check only ($effect never runs during SSR); the settings page
	// owns the actual push state.
	let webPushOff = $state(false);
	$effect(() => {
		webPushOff = !('Notification' in window) || Notification.permission !== 'granted';
	});
	const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
	// The time-of-day label is only a grouping header, but it is the best hint we have
	// for what clock time the user actually means, so it seeds the first row.
	const timeOfDayDefaults: Record<string, string> = {
		morning: '08:00',
		noon: '12:00',
		evening: '20:00'
	};

	const addReminderTime = () => {
		if (reminderTimes.length >= MAX_REMINDERS) return;
		const preferred = timeOfDayDefaults[timeOfDay ?? ''] ?? '08:00';
		const candidates = [preferred, '08:00', '12:00', '20:00'];
		const next = candidates.find((t) => !reminderTimes.includes(t)) ?? '08:00';
		reminderTimes = [...reminderTimes, next];
	};

	const removeReminderTime = (index: number) => {
		reminderTimes = reminderTimes.filter((_, i) => i !== index);
	};

	// weekly / specific_days schedules are meaningless (never due) with no days picked.
	const requiresScheduleDays = $derived(
		scheduleType === 'weekly' || scheduleType === 'specific_days'
	);

	const isValid = $derived(
		name.trim().length > 0 &&
			ingredients.length > 0 &&
			ingredients.every(
				(i) => i.name.trim().length > 0 && (i.dosage > 0 || (i.originalText ?? '').length > 0)
			) &&
			(!requiresScheduleDays || scheduleDays.length > 0) &&
			// Native type="time" enforces this, but a browser without support degrades to text.
			reminderTimes.every((t) => timeRe.test(t))
	);

	const handleSubmit = () => {
		const payload: SupplementPayload = {
			name,
			scheduleType,
			timeOfDay: timeOfDay || null,
			ingredients: ingredients.map((ing, i) => {
				if (ing.foodId) {
					return { foodId: ing.foodId, servings: 1, sortOrder: i };
				}
				// Prefer a rebuilt "<dosage> <unit>" label, but fall back to the
				// preserved originalText if the user never entered a dosage (so a
				// round-tripped free-form label survives).
				const ingredientsText =
					ing.dosage > 0 ? `${ing.dosage} ${ing.dosageUnit}` : (ing.originalText ?? '');
				return {
					food: {
						name: ing.name,
						servingSize: 1,
						servingUnit: 'g',
						calories: 0,
						protein: 0,
						carbs: 0,
						fat: 0,
						fiber: 0,
						ingredientsText
					},
					servings: 1,
					sortOrder: i
				};
			})
		};
		if (scheduleType === 'weekly' || scheduleType === 'specific_days') {
			payload.scheduleDays = scheduleDays;
		}
		if (scheduleType === 'every_other_day') {
			payload.scheduleStartDate = scheduleStartDate;
		}
		// Always sent, so removing the last row clears the stored times.
		payload.reminderTimes = [...new Set(reminderTimes)].sort();

		onSave(payload);
	};
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div class="space-y-2">
		<Label for="name">{m.supplements_name()}</Label>
		<Input id="name" bind:value={name} required />
	</div>

	<div class="space-y-2">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<Label>{m.supplements_ingredients()}</Label>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-label={m.supplements_add_ingredient()}
				onclick={addIngredient}
			>
				<Plus class="size-3.5 sm:mr-1" />
				<span class="hidden sm:inline">{m.supplements_add_ingredient()}</span>
			</Button>
		</div>
		<div class="space-y-2">
			{#each ingredients as ing, i}
				<div class="flex min-w-0 flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center">
					<Input
						placeholder={m.supplements_ingredient_name()}
						bind:value={ing.name}
						required
						class="min-w-0 flex-1"
					/>
					<NumberInput
						bind:value={() => ing.dosage, (v) => (ing.dosage = v ?? 0)}
						required
						class="w-full sm:w-20"
					/>
					<Select.Root
						type="single"
						value={ing.dosageUnit}
						onValueChange={(v) => (ing.dosageUnit = v)}
					>
						<Select.Trigger class="w-full sm:w-20">
							<span>{ing.dosageUnit}</span>
						</Select.Trigger>
						<Select.Content>
							{#each dosageUnits as unit}
								<Select.Item value={unit}>{unit}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="self-end sm:self-auto"
						aria-label={m.supplements_remove_ingredient()}
						disabled={ingredients.length <= 1}
						onclick={() => removeIngredient(i)}
					>
						<X class="size-4" />
					</Button>
				</div>
			{/each}
		</div>
	</div>

	<div class="space-y-2">
		<Label>{m.supplements_schedule()}</Label>
		<Select.Root
			type="single"
			value={scheduleType}
			onValueChange={(v) => (scheduleType = v as ScheduleType)}
		>
			<Select.Trigger class="w-full">
				<span>{scheduleTypes.find((s) => s.value === scheduleType)?.label() ?? scheduleType}</span>
			</Select.Trigger>
			<Select.Content>
				{#each scheduleTypes as st}
					<Select.Item value={st.value}>{st.label()}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	{#if scheduleType === 'weekly' || scheduleType === 'specific_days'}
		<div class="space-y-2">
			<Label>{m.supplements_days()}</Label>
			<div class="grid grid-cols-4 gap-1 sm:grid-cols-7">
				{#each dayLabels as dayLabel, i}
					<Button
						type="button"
						size="sm"
						variant={scheduleDays.includes(i) ? 'default' : 'outline'}
						class="w-full px-1 text-xs"
						onclick={() => toggleDay(i)}
					>
						{dayLabel()}
					</Button>
				{/each}
			</div>
		</div>
	{/if}

	{#if scheduleType === 'every_other_day'}
		<div class="space-y-2">
			<Label for="startDate">{m.supplements_start_date()}</Label>
			<Input id="startDate" type="date" bind:value={scheduleStartDate} />
		</div>
	{/if}

	<div class="space-y-2">
		<Label>{m.supplements_time_of_day()}</Label>
		<Select.Root
			type="single"
			value={timeOfDay ?? ''}
			onValueChange={(v) => (timeOfDay = (v || null) as typeof timeOfDay)}
		>
			<Select.Trigger class="w-full">
				<span
					>{timeOfDayOptions.find((o) => o.value === (timeOfDay ?? ''))?.label() ??
						m.supplements_time_anytime()}</span
				>
			</Select.Trigger>
			<Select.Content>
				{#each timeOfDayOptions as opt}
					<Select.Item value={opt.value}>{opt.label()}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<div class="space-y-2">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<Label>{m.supplements_reminders()}</Label>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-label={m.supplements_add_reminder()}
				disabled={reminderTimes.length >= MAX_REMINDERS}
				onclick={addReminderTime}
			>
				<Plus class="size-3.5 sm:mr-1" />
				<span class="hidden sm:inline">{m.supplements_add_reminder()}</span>
			</Button>
		</div>
		{#if reminderTimes.length > 0}
			<div class="space-y-2">
				{#each reminderTimes as _, i}
					<div class="flex min-w-0 items-center gap-2 rounded-md border p-2">
						<Input
							type="time"
							aria-label={m.supplements_reminder_time()}
							bind:value={reminderTimes[i]}
							class="min-w-0 flex-1"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={m.supplements_remove_reminder()}
							onclick={() => removeReminderTime(i)}
						>
							<X class="size-4" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
		<p class="text-muted-foreground text-sm">{m.supplements_reminders_mobile_only()}</p>
		{#if reminderTimes.length > 0 && webPushOff}
			<p class="text-muted-foreground text-sm">
				<a class="underline underline-offset-4" href="/settings"
					>{m.supplements_reminders_enable_web()}</a
				>
			</p>
		{/if}
	</div>

	<div class="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
		<Button
			type="button"
			variant="outline"
			class="w-full sm:w-auto"
			aria-label={m.cancel()}
			onclick={onCancel}
		>
			<X class="size-4" />
			<span class="sm:inline">{m.cancel()}</span>
		</Button>
		<Button
			type="submit"
			class="w-full sm:w-auto"
			aria-label={m.supplements_save()}
			disabled={!isValid}
		>
			<Check class="size-4" />
			<span>{m.supplements_save()}</span>
		</Button>
	</div>
</form>
