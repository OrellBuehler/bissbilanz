<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { DEFAULT_MEAL_TYPES, validateFavoriteMealTimeframes } from '$lib/utils/meals';
	import * as m from '$lib/paraglide/messages';

	export type AssignmentMode = 'time_based' | 'ask_meal';

	export type TimeframeDraft = {
		id: string;
		mealType: string;
		customMealTypeId: string | null;
		startTime: string;
		endTime: string;
	};

	type Props = {
		mode: AssignmentMode;
		timeframes: TimeframeDraft[];
		mealTypes: Array<{ id: string; name: string; sortOrder: number }>;
		onSave: (config: {
			favoriteMealAssignmentMode: AssignmentMode;
			favoriteMealTimeframes: Array<Omit<TimeframeDraft, 'id'>>;
		}) => Promise<boolean>;
	};

	let { mode = $bindable(), timeframes = $bindable(), mealTypes, onSave }: Props = $props();

	let saving = $state(false);

	const mealTypeOptions = $derived([
		...DEFAULT_MEAL_TYPES.map((meal) => ({
			value: `default:${meal}`,
			label: meal,
			mealType: meal,
			customMealTypeId: null as string | null
		})),
		...mealTypes.map((meal) => ({
			value: `custom:${meal.id}`,
			label: meal.name,
			mealType: meal.name,
			customMealTypeId: meal.id
		}))
	]);

	const mealTypeSelectValue = (row: TimeframeDraft) =>
		row.customMealTypeId ? `custom:${row.customMealTypeId}` : `default:${row.mealType}`;

	const setRowMealSelection = (rowId: string, value: string) => {
		const selected = mealTypeOptions.find((opt) => opt.value === value);
		if (!selected) return;
		timeframes = timeframes.map((row) =>
			row.id === rowId
				? {
						...row,
						mealType: selected.mealType,
						customMealTypeId: selected.customMealTypeId
					}
				: row
		);
	};

	const validation = $derived.by(() => {
		const result = validateFavoriteMealTimeframes(
			timeframes.map((row) => ({
				mealType: row.mealType,
				startTime: row.startTime,
				endTime: row.endTime
			}))
		);
		if (result.valid) return { valid: true as const, message: '' };
		const messages = {
			'invalid-time': 'Use valid times in HH:mm format.',
			'invalid-range':
				'Start time must be before end time. Cross-midnight windows are not supported.',
			overlap: 'Time windows cannot overlap.',
			'missing-meal-type': 'Each timeframe must have a meal type.'
		};
		return { valid: false as const, message: messages[result.error] };
	});

	const overlappingRowIds = $derived.by(() => {
		const parsed = timeframes
			.map((row) => {
				const [sh, sm] = row.startTime.split(':');
				const [eh, em] = row.endTime.split(':');
				if (!/^\d{2}:\d{2}$/.test(row.startTime) || !/^\d{2}:\d{2}$/.test(row.endTime)) {
					return null;
				}
				const start = Number(sh) * 60 + Number(sm);
				const end = Number(eh) * 60 + Number(em);
				if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
				return { id: row.id, start, end };
			})
			.filter(Boolean) as Array<{ id: string; start: number; end: number }>;

		const overlaps = new Set<string>();
		for (let i = 0; i < parsed.length; i++) {
			for (let j = i + 1; j < parsed.length; j++) {
				const a = parsed[i];
				const b = parsed[j];
				if (a && b && a.start < b.end && b.start < a.end) {
					overlaps.add(a.id);
					overlaps.add(b.id);
				}
			}
		}
		return overlaps;
	});

	const createRow = (): TimeframeDraft => ({
		id: crypto.randomUUID(),
		mealType: 'Breakfast',
		customMealTypeId: null,
		startTime: '08:00',
		endTime: '10:00'
	});

	const addRow = () => {
		timeframes = [...timeframes, createRow()];
	};

	const updateRow = (rowId: string, patch: Partial<TimeframeDraft>) => {
		timeframes = timeframes.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
	};

	const removeRow = (rowId: string) => {
		timeframes = timeframes.filter((row) => row.id !== rowId);
	};

	const save = async () => {
		if (!validation.valid) return;
		saving = true;
		try {
			const ok = await onSave({
				favoriteMealAssignmentMode: mode,
				favoriteMealTimeframes: timeframes.map((row) => ({
					mealType: row.mealType,
					customMealTypeId: row.customMealTypeId,
					startTime: row.startTime,
					endTime: row.endTime
				}))
			});
			if (ok) toast.success(m.settings_saved(), { duration: 1500 });
			else toast.error(m.settings_save_failed());
		} catch {
			toast.error(m.settings_save_failed());
		} finally {
			saving = false;
		}
	};
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_favorites_logging()}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="space-y-2">
			<Label>{m.settings_meal_assignment()}</Label>
			<RadioGroup.Root
				value={mode}
				onValueChange={(v) => (mode = v as AssignmentMode)}
				class="flex flex-col gap-3"
			>
				<div class="flex items-center gap-2">
					<RadioGroup.Item value="time_based" id="favorites-meal-time-based" />
					<Label for="favorites-meal-time-based">{m.settings_meal_auto_assign()}</Label>
				</div>
				<div class="flex items-center gap-2">
					<RadioGroup.Item value="ask_meal" id="favorites-meal-ask" />
					<Label for="favorites-meal-ask">{m.settings_meal_always_ask()}</Label>
				</div>
			</RadioGroup.Root>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<div>
					<p class="text-sm font-medium">{m.settings_auto_assignment_timeframes()}</p>
					<p class="text-muted-foreground text-xs">
						{m.settings_auto_assignment_timeframes_desc()}
					</p>
				</div>
				<Button variant="outline" size="sm" onclick={addRow}>
					<Plus class="size-4" />
					{m.settings_add_timeframe()}
				</Button>
			</div>

			{#if timeframes.length === 0}
				<p class="text-muted-foreground text-sm">{m.settings_no_timeframes()}</p>
			{/if}

			<div class="space-y-2">
				{#each timeframes as row (row.id)}
					<div
						class={`grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr_auto] ${
							overlappingRowIds.has(row.id) ? 'border-destructive/60 bg-destructive/5' : ''
						}`}
					>
						<div class="space-y-1">
							<Label class="text-xs">{m.settings_timeframe_meal()}</Label>
							<Select.Root
								type="single"
								value={mealTypeSelectValue(row)}
								onValueChange={(v) => setRowMealSelection(row.id, v)}
							>
								<Select.Trigger class="w-full">
									<span>
										{mealTypeOptions.find((opt) => opt.value === mealTypeSelectValue(row))?.label ??
											row.mealType}
									</span>
								</Select.Trigger>
								<Select.Content>
									{#each mealTypeOptions as option}
										<Select.Item value={option.value}>{option.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="space-y-1">
							<Label for={`start-${row.id}`} class="text-xs">{m.settings_timeframe_from()}</Label>
							<Input
								id={`start-${row.id}`}
								type="time"
								value={row.startTime}
								oninput={(e) =>
									updateRow(row.id, {
										startTime: (e.currentTarget as HTMLInputElement).value
									})}
							/>
						</div>
						<div class="space-y-1">
							<Label for={`end-${row.id}`} class="text-xs">{m.settings_timeframe_to()}</Label>
							<Input
								id={`end-${row.id}`}
								type="time"
								value={row.endTime}
								oninput={(e) =>
									updateRow(row.id, {
										endTime: (e.currentTarget as HTMLInputElement).value
									})}
							/>
						</div>
						<div class="flex items-end">
							<Button
								variant="ghost"
								size="icon"
								aria-label="Remove timeframe"
								onclick={() => removeRow(row.id)}
							>
								<Trash2 class="size-4" />
							</Button>
						</div>
					</div>
				{/each}
			</div>

			{#if !validation.valid}
				<p class="text-destructive text-sm">{validation.message}</p>
			{/if}
		</div>

		<div class="flex justify-end">
			<Button onclick={save} disabled={saving || !validation.valid}>
				{saving ? m.settings_saving() : m.settings_save()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
