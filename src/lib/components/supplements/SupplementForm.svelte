<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { dosageUnitValues } from '$lib/supplement-units';
	import { today } from '$lib/utils/dates';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	import type { ScheduleType } from '$lib/supplement-units';

	type IngredientInput = {
		name: string;
		dosage: number;
		dosageUnit: string;
	};

	type SupplementWithIngredients = {
		id: string;
		name: string;
		dosage: number;
		dosageUnit: string;
		scheduleType: string;
		scheduleDays: number[] | null;
		scheduleStartDate: string | null;
		timeOfDay: string | null;
		ingredients?: { name: string; dosage: number; dosageUnit: string }[];
	};

	let {
		supplement,
		onSave,
		onCancel
	}: {
		supplement?: SupplementWithIngredients | null;
		onSave: (payload: Record<string, unknown>) => void;
		onCancel: () => void;
	} = $props();

	let name = $state(supplement?.name ?? '');
	let dosage = $state(supplement?.dosage ?? 0);
	let dosageUnit = $state(supplement?.dosageUnit ?? 'mg');
	let scheduleType: ScheduleType = $state((supplement?.scheduleType as ScheduleType) ?? 'daily');
	let scheduleDays = $state<number[]>(supplement?.scheduleDays ?? []);
	let scheduleStartDate = $state(supplement?.scheduleStartDate ?? today());
	let timeOfDay = $state<string | null>(supplement?.timeOfDay ?? null);
	let ingredients = $state<IngredientInput[]>(
		supplement?.ingredients?.map((i) => ({ name: i.name, dosage: i.dosage, dosageUnit: i.dosageUnit })) ?? []
	);

	const hasIngredients = $derived(ingredients.length > 0);

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
		ingredients = ingredients.filter((_, i) => i !== index);
	};

	const handleSubmit = () => {
		const payload: Record<string, unknown> = {
			name,
			dosage,
			dosageUnit,
			scheduleType
		};
		if (scheduleType === 'weekly' || scheduleType === 'specific_days') {
			payload.scheduleDays = scheduleDays;
		}
		if (scheduleType === 'every_other_day') {
			payload.scheduleStartDate = scheduleStartDate;
		}
		payload.timeOfDay = timeOfDay || null;

		if (ingredients.length > 0) {
			payload.ingredients = ingredients.map((ing, i) => ({
				name: ing.name,
				dosage: ing.dosage,
				dosageUnit: ing.dosageUnit,
				sortOrder: i
			}));
		} else if (supplement?.ingredients?.length) {
			payload.ingredients = null;
		}

		onSave(payload);
	};
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div class="space-y-2">
		<Label for="name">{m.supplements_name()}</Label>
		<Input id="name" bind:value={name} required />
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div class="space-y-2">
			<Label for="dosage">{hasIngredients ? m.supplements_serving_form() : m.supplements_dosage()}</Label>
			<Input id="dosage" type="number" step="any" min="0" bind:value={dosage} required />
		</div>
		<div class="space-y-2">
			<Label>{m.supplements_unit()}</Label>
			<Select.Root type="single" value={dosageUnit} onValueChange={(v) => (dosageUnit = v)}>
				<Select.Trigger>
					<span>{dosageUnit}</span>
				</Select.Trigger>
				<Select.Content>
					{#each dosageUnits as unit}
						<Select.Item value={unit}>{unit}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<Label>{m.supplements_ingredients()}</Label>
			<Button type="button" variant="ghost" size="sm" onclick={addIngredient}>
				<Plus class="mr-1 size-3.5" />
				{m.supplements_add_ingredient()}
			</Button>
		</div>
		{#if ingredients.length > 0}
			<div class="space-y-2">
				{#each ingredients as ing, i}
					<div class="flex items-center gap-2">
						<Input
							placeholder={m.supplements_ingredient_name()}
							bind:value={ing.name}
							required
							class="flex-1"
						/>
						<Input
							type="number"
							step="any"
							min="0"
							bind:value={ing.dosage}
							required
							class="w-20"
						/>
						<Select.Root type="single" value={ing.dosageUnit} onValueChange={(v) => (ing.dosageUnit = v)}>
							<Select.Trigger class="w-20">
								<span>{ing.dosageUnit}</span>
							</Select.Trigger>
							<Select.Content>
								{#each dosageUnits as unit}
									<Select.Item value={unit}>{unit}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<Button type="button" variant="ghost" size="icon" onclick={() => removeIngredient(i)}>
							<X class="size-4" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="space-y-2">
		<Label>{m.supplements_schedule()}</Label>
		<Select.Root type="single" value={scheduleType} onValueChange={(v) => (scheduleType = v as ScheduleType)}>
			<Select.Trigger>
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
			<div class="flex gap-1">
				{#each dayLabels as dayLabel, i}
					<Button
						type="button"
						size="sm"
						variant={scheduleDays.includes(i) ? 'default' : 'outline'}
						class="flex-1 px-1 text-xs"
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
		<Select.Root type="single" value={timeOfDay ?? ''} onValueChange={(v) => (timeOfDay = v || null)}>
			<Select.Trigger>
				<span>{timeOfDayOptions.find((o) => o.value === (timeOfDay ?? ''))?.label() ?? m.supplements_time_anytime()}</span>
			</Select.Trigger>
			<Select.Content>
				{#each timeOfDayOptions as opt}
					<Select.Item value={opt.value}>{opt.label()}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<div class="flex justify-end gap-2 pt-2">
		<Button type="button" variant="outline" onclick={onCancel}>
			{m.supplements_cancel()}
		</Button>
		<Button type="submit" disabled={!name || dosage <= 0}>
			{m.supplements_save()}
		</Button>
	</div>
</form>
