<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { dosageUnitValues } from '$lib/supplement-units';
	import { today } from '$lib/utils/dates';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Check from '@lucide/svelte/icons/check';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	import type { ScheduleType } from '$lib/supplement-units';

	type IngredientInput = {
		name: string;
		dosage: number;
		dosageUnit: string;
	};

	export type SupplementPayload = {
		name: string;
		dosage: number;
		dosageUnit: string;
		scheduleType: ScheduleType;
		scheduleDays?: number[];
		scheduleStartDate?: string;
		timeOfDay?: 'morning' | 'noon' | 'evening' | null;
		ingredients?: { name: string; dosage: number; dosageUnit: string; sortOrder: number }[] | null;
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
		onSave: (payload: SupplementPayload) => void;
		onCancel: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(supplement?.name ?? '');
	// svelte-ignore state_referenced_locally
	let dosage = $state(supplement?.dosage ? round2(supplement.dosage) : 0);
	// svelte-ignore state_referenced_locally
	let dosageUnit = $state(supplement?.dosageUnit ?? 'mg');
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
	let ingredients = $state<IngredientInput[]>(
		supplement?.ingredients?.map((i) => ({
			name: i.name,
			dosage: round2(i.dosage),
			dosageUnit: i.dosageUnit
		})) ?? []
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
		const payload: SupplementPayload = {
			name,
			dosage,
			dosageUnit,
			scheduleType,
			timeOfDay: timeOfDay || null
		};
		if (scheduleType === 'weekly' || scheduleType === 'specific_days') {
			payload.scheduleDays = scheduleDays;
		}
		if (scheduleType === 'every_other_day') {
			payload.scheduleStartDate = scheduleStartDate;
		}

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

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<Label for="dosage"
				>{hasIngredients ? m.supplements_serving_form() : m.supplements_dosage()}</Label
			>
			<Input id="dosage" type="number" step="any" min="0" bind:value={dosage} required />
		</div>
		<div class="space-y-2">
			<Label>{m.supplements_unit()}</Label>
			<Select.Root type="single" value={dosageUnit} onValueChange={(v) => (dosageUnit = v)}>
				<Select.Trigger class="w-full">
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
		{#if ingredients.length > 0}
			<div class="space-y-2">
				{#each ingredients as ing, i}
					<div
						class="flex min-w-0 flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center"
					>
						<Input
							placeholder={m.supplements_ingredient_name()}
							bind:value={ing.name}
							required
							class="min-w-0 flex-1"
						/>
						<Input
							type="number"
							step="any"
							min="0"
							bind:value={ing.dosage}
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
							onclick={() => removeIngredient(i)}
						>
							<X class="size-4" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
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
			disabled={!name || dosage <= 0}
		>
			<Check class="size-4" />
			<span>{m.supplements_save()}</span>
		</Button>
	</div>
</form>
