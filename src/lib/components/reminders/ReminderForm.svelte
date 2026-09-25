<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import X from '@lucide/svelte/icons/x';
	import Check from '@lucide/svelte/icons/check';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { mealTypeService } from '$lib/services/meal-type-service.svelte';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import type { DexieCustomMealType, DexieReminder } from '$lib/db/types';
	import * as m from '$lib/paraglide/messages';

	export type ReminderKind = 'weight' | 'meal' | 'sleep';

	export type ReminderPayload = {
		kind: ReminderKind;
		mealType?: string | null;
		time: string;
		weekdays: number[];
		enabled: boolean;
	};

	let {
		reminder,
		onSave,
		onCancel
	}: {
		reminder?: DexieReminder | null;
		onSave: (payload: ReminderPayload) => void;
		onCancel: () => void;
	} = $props();

	const customMealTypes = useLiveQuery(
		() => mealTypeService.mealTypes(),
		[] as DexieCustomMealType[]
	);

	const mealTypeOptions = $derived([
		...DEFAULT_MEAL_TYPES,
		...customMealTypes.value.map((mt) => mt.name)
	]);

	// svelte-ignore state_referenced_locally
	let kind = $state<ReminderKind>(reminder?.kind ?? 'weight');
	// svelte-ignore state_referenced_locally
	let mealType = $state(reminder?.mealType ?? mealTypeOptions[0] ?? 'Breakfast');
	// svelte-ignore state_referenced_locally
	let time = $state(reminder?.time ?? '08:00');
	// svelte-ignore state_referenced_locally
	let weekdays = $state<number[]>(reminder?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
	// svelte-ignore state_referenced_locally
	let enabled = $state(reminder?.enabled ?? true);

	const kindOptions: { value: ReminderKind; label: () => string }[] = [
		{ value: 'weight', label: () => m.reminders_kind_weight() },
		{ value: 'meal', label: () => m.reminders_kind_meal() },
		{ value: 'sleep', label: () => m.reminders_kind_sleep() }
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
		if (weekdays.includes(day)) {
			weekdays = weekdays.filter((d) => d !== day);
		} else {
			weekdays = [...weekdays, day].sort((a, b) => a - b);
		}
	};

	const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

	const isValid = $derived(
		timeRe.test(time) && weekdays.length > 0 && (kind !== 'meal' || mealType.trim().length > 0)
	);

	const handleSubmit = () => {
		onSave({
			kind,
			mealType: kind === 'meal' ? mealType : null,
			time,
			weekdays,
			enabled
		});
	};
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div class="space-y-2">
		<Label>{m.reminders_kind()}</Label>
		<Select.Root type="single" value={kind} onValueChange={(v) => (kind = v as ReminderKind)}>
			<Select.Trigger class="w-full">
				<span>{kindOptions.find((k) => k.value === kind)?.label() ?? kind}</span>
			</Select.Trigger>
			<Select.Content>
				{#each kindOptions as opt}
					<Select.Item value={opt.value}>{opt.label()}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	{#if kind === 'meal'}
		<div class="space-y-2">
			<Label>{m.reminders_meal_type()}</Label>
			<Select.Root type="single" value={mealType} onValueChange={(v) => (mealType = v)}>
				<Select.Trigger class="w-full">
					<span>{mealType}</span>
				</Select.Trigger>
				<Select.Content>
					{#each mealTypeOptions as opt}
						<Select.Item value={opt}>{opt}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{/if}

	<div class="space-y-2">
		<Label for="reminder-time">{m.reminders_time()}</Label>
		<Input id="reminder-time" type="time" bind:value={time} required />
	</div>

	<div class="space-y-2">
		<Label>{m.reminders_weekdays()}</Label>
		<div class="grid grid-cols-4 gap-1 sm:grid-cols-7">
			{#each dayLabels as dayLabel, i}
				<Button
					type="button"
					size="sm"
					variant={weekdays.includes(i) ? 'default' : 'outline'}
					class="w-full px-1 text-xs"
					onclick={() => toggleDay(i)}
				>
					{dayLabel()}
				</Button>
			{/each}
		</div>
	</div>

	<div class="flex items-center justify-between gap-4">
		<Label for="reminder-enabled" class="text-sm font-medium">{m.reminders_enabled()}</Label>
		<Switch id="reminder-enabled" checked={enabled} onCheckedChange={(v) => (enabled = v)} />
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
			aria-label={m.reminders_save()}
			disabled={!isValid}
		>
			<Check class="size-4" />
			<span>{m.reminders_save()}</span>
		</Button>
	</div>
</form>
