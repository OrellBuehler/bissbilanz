<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import Search from '@lucide/svelte/icons/search';
	import * as m from '$lib/paraglide/messages';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import type { components } from '$lib/api/generated/schema';
	import { ALL_NUTRIENT_KEYS, NUTRIENT_BY_KEY } from '$lib/nutrients';
	import { nutrientLabel } from '$lib/nutrients-i18n';
	import { foodService } from '$lib/services/food-service.svelte';

	type Food = components['schemas']['Food'];

	type Props = {
		open: boolean;
		candidates: Food[];
		allFoods: Food[];
		onClose: () => void;
		onCompleted?: () => void;
	};

	let { open = $bindable(false), candidates, allFoods, onClose, onCompleted }: Props = $props();

	let keeperId = $state<string | null>(null);
	let keeperSearch = $state('');
	let overrides = $state<Record<string, unknown>>({});
	let merging = $state(false);

	const CORE_FIELDS = [
		'name',
		'brand',
		'servingSize',
		'servingUnit',
		'calories',
		'protein',
		'carbs',
		'fat',
		'fiber',
		'barcode',
		'isFavorite',
		'nutriScore',
		'novaGroup',
		'additives',
		'ingredientsText',
		'imageUrl'
	] as const;

	const FIELD_LABELS = {
		name: () => m.food_field_name(),
		brand: () => m.food_field_brand(),
		servingSize: () => m.food_field_serving_size(),
		servingUnit: () => m.food_field_serving_unit(),
		calories: () => m.food_field_calories(),
		protein: () => m.food_field_protein(),
		carbs: () => m.food_field_carbs(),
		fat: () => m.food_field_fat(),
		fiber: () => m.food_field_fiber(),
		barcode: () => m.food_field_barcode(),
		isFavorite: () => m.food_field_is_favorite(),
		nutriScore: () => m.food_field_nutri_score(),
		novaGroup: () => m.food_field_nova_group(),
		additives: () => m.food_field_additives(),
		ingredientsText: () => m.food_field_ingredients_text(),
		imageUrl: () => m.food_field_image_url()
	} as const;

	function fieldLabel(field: string): string {
		const fn = (FIELD_LABELS as Record<string, () => string>)[field];
		if (fn) return fn();
		const def = NUTRIENT_BY_KEY.get(field);
		if (def) return nutrientLabel(def);
		return field;
	}

	$effect(() => {
		if (open) {
			overrides = {};
			if (candidates.length >= 2) {
				keeperId = candidates[0]?.id ?? null;
			} else {
				keeperId = null;
			}
			keeperSearch = '';
		}
	});

	const keeperPickerResults = $derived.by(() => {
		if (candidates.length !== 1) return [];
		const sourceIds = new Set(candidates.map((c) => c.id));
		const q = keeperSearch.trim().toLowerCase();
		const pool = allFoods.filter((f) => !sourceIds.has(f.id));
		if (!q) return pool;
		return pool.filter(
			(f) =>
				f.name.toLowerCase().includes(q) ||
				(f.brand ?? '').toLowerCase().includes(q) ||
				(f.barcode ?? '').includes(q)
		);
	});

	// Virtualization for the keeper picker — handles arbitrary food counts
	// without rendering thousands of DOM nodes.
	const ROW_HEIGHT = 48;
	const VIEWPORT_HEIGHT = 256; // matches max-h-64 below
	const OVERSCAN = 4;

	let pickerScrollEl = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);

	function onPickerScroll(e: Event) {
		scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
	}

	$effect(() => {
		// Reset scroll when the result set changes (e.g. user types in search).
		void keeperSearch;
		if (pickerScrollEl) {
			pickerScrollEl.scrollTop = 0;
			scrollTop = 0;
		}
	});

	const pickerWindow = $derived.by(() => {
		const total = keeperPickerResults.length;
		const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
		const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
		const endIndex = Math.min(total, startIndex + visibleCount);
		return {
			startIndex,
			endIndex,
			items: keeperPickerResults.slice(startIndex, endIndex),
			totalHeight: total * ROW_HEIGHT,
			offsetY: startIndex * ROW_HEIGHT
		};
	});

	const keeper = $derived<Food | null>(
		keeperId ? (allFoods.find((f) => f.id === keeperId) ?? null) : null
	);

	const sources = $derived<Food[]>(keeper ? candidates.filter((c) => c.id !== keeper.id) : []);

	const allMergeFields = $derived([...CORE_FIELDS, ...ALL_NUTRIENT_KEYS]);

	function isEmpty(value: unknown): boolean {
		if (value === null || value === undefined) return true;
		if (typeof value === 'string' && value.trim() === '') return true;
		if (Array.isArray(value) && value.length === 0) return true;
		return false;
	}

	function fmt(value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (value === '') return '—';
		if (typeof value === 'boolean') return value ? '✓' : '✗';
		if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ');
		return String(value);
	}

	type ChoiceRow = {
		field: string;
		label: string;
		auto: unknown;
		choices: Array<{ key: string; label: string; value: unknown; foodIds: string[] }>;
	};

	const diffRows = $derived.by<ChoiceRow[]>(() => {
		if (!keeper || sources.length === 0) return [];
		const rows: ChoiceRow[] = [];
		for (const field of allMergeFields) {
			const k = (keeper as Record<string, unknown>)[field];
			const sourceValues = sources.map((s) => ({
				foodId: s.id,
				value: (s as Record<string, unknown>)[field]
			}));

			const allEqual = sourceValues.every((sv) => valuesEqual(sv.value, k));
			if (allEqual) continue;

			let auto: unknown;
			if (field === 'isFavorite') {
				auto = Boolean(k) || sourceValues.some((sv) => Boolean(sv.value));
			} else if (isEmpty(k)) {
				const firstNonEmpty = sourceValues.find((sv) => !isEmpty(sv.value));
				auto = firstNonEmpty ? firstNonEmpty.value : k;
			} else {
				auto = k;
			}

			const seen = new Map<string, { label: string; value: unknown; foodIds: string[] }>();
			const keeperKey = JSON.stringify(k ?? null);
			seen.set(keeperKey, {
				label: m.foods_merge_field_keeper(),
				value: k,
				foodIds: [keeper.id]
			});
			for (const sv of sourceValues) {
				const sk = JSON.stringify(sv.value ?? null);
				if (seen.has(sk)) {
					seen.get(sk)!.foodIds.push(sv.foodId);
				} else {
					seen.set(sk, {
						label: m.foods_merge_field_source(),
						value: sv.value,
						foodIds: [sv.foodId]
					});
				}
			}

			const choices = Array.from(seen.entries()).map(([key, v]) => ({
				key,
				label: v.label,
				value: v.value,
				foodIds: v.foodIds
			}));
			rows.push({ field, label: fieldLabel(field), auto, choices });
		}
		return rows;
	});

	function valuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (a == null && b == null) return true;
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return false;
			return a.every((v, i) => v === b[i]);
		}
		return false;
	}

	function getCurrentValue(row: ChoiceRow): unknown {
		if (row.field in overrides) return overrides[row.field];
		return row.auto;
	}

	function selectionKey(row: ChoiceRow): string {
		const current = getCurrentValue(row);
		const matched = row.choices.find((c) => valuesEqual(c.value, current));
		return matched ? matched.key : '__custom__';
	}

	function chooseValue(row: ChoiceRow, key: string) {
		if (key === '__custom__') {
			if (!(row.field in overrides)) {
				overrides = { ...overrides, [row.field]: row.auto };
			}
			return;
		}
		const choice = row.choices.find((c) => c.key === key);
		if (!choice) return;
		const next = { ...overrides };
		delete next[row.field];
		if (!valuesEqual(choice.value, row.auto)) {
			next[row.field] = choice.value;
		}
		overrides = next;
	}

	function setCustomValue(row: ChoiceRow, raw: string) {
		const def = NUTRIENT_BY_KEY.get(row.field);
		const isNumeric =
			def !== undefined ||
			['servingSize', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'novaGroup'].includes(
				row.field
			);
		const isArray = row.field === 'additives';
		let parsed: unknown;
		if (raw === '') {
			parsed = isArray ? [] : null;
		} else if (isArray) {
			parsed = raw
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		} else if (isNumeric) {
			const n = Number(raw);
			parsed = Number.isNaN(n) ? raw : n;
		} else {
			parsed = raw;
		}
		overrides = { ...overrides, [row.field]: parsed };
	}

	function customDisplayValue(row: ChoiceRow): string {
		const v = getCurrentValue(row);
		if (v === null || v === undefined) return '';
		if (Array.isArray(v)) return v.join(', ');
		return String(v);
	}

	async function performMerge() {
		if (!keeper || sources.length === 0) return;
		merging = true;

		try {
			const { error } = await api.POST('/api/foods/merge', {
				body: {
					keeperId: keeper.id,
					sourceIds: sources.map((s) => s.id),
					overrides: Object.keys(overrides).length > 0 ? overrides : undefined
				}
			});
			if (error) {
				toast.error(m.foods_merge_failed());
				return;
			}
			toast.success(m.foods_merge_success());
			await foodService.refresh();
			onCompleted?.();
			onClose();
		} catch {
			toast.error(m.foods_merge_failed());
		} finally {
			merging = false;
		}
	}

	const sourceLabel = $derived(candidates[0]?.name ?? '');
</script>

<ResponsiveModal
	bind:open
	openFull
	title={m.foods_merge_title()}
	description={m.foods_merge_description({ source: sourceLabel })}
	onAnimationEnd={(isOpen) => {
		if (!isOpen) onClose();
	}}
>
	{#if candidates.length === 1}
		<!-- Keeper picker mode -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">{m.foods_merge_pick_keeper()}</Label>
			<div class="relative">
				<Search
					class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
				/>
				<Input
					class="pl-9"
					placeholder={m.foods_merge_search_placeholder()}
					bind:value={keeperSearch}
				/>
			</div>
			{#if keeperPickerResults.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">
					{m.foods_merge_no_keeper_results()}
				</p>
			{:else}
				<div
					bind:this={pickerScrollEl}
					onscroll={onPickerScroll}
					class="max-h-64 overflow-y-auto rounded-md border"
				>
					<div style="height: {pickerWindow.totalHeight}px; position: relative;">
						<div
							style="position: absolute; top: 0; left: 0; right: 0; transform: translateY({pickerWindow.offsetY}px);"
						>
							{#each pickerWindow.items as food, i (food.id)}
								<button
									type="button"
									style="height: {ROW_HEIGHT}px;"
									class="flex w-full items-center justify-between gap-3 px-3 text-left transition-colors {keeperId ===
									food.id
										? 'bg-accent'
										: 'hover:bg-accent/50'}"
									onclick={() => (keeperId = food.id)}
									data-index={pickerWindow.startIndex + i}
								>
									<span class="min-w-0 flex-1 truncate">
										<span class="font-medium">{food.name}</span>
										{#if food.brand}
											<span class="ml-2 text-xs text-muted-foreground">{food.brand}</span>
										{/if}
									</span>
									<span class="shrink-0 text-xs tabular-nums text-muted-foreground">
										{Math.round(food.calories)} kcal
									</span>
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Group mode: pick keeper from the candidates -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">{m.foods_merge_pick_keeper()}</Label>
			<RadioGroup.Root bind:value={keeperId as string} class="space-y-2">
				{#each candidates as food (food.id)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:bg-accent"
					>
						<RadioGroup.Item value={food.id} class="mt-1" />
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-medium">{food.name}</span>
								{#if food.barcode}
									<Badge variant="outline" class="font-mono text-[10px]">{food.barcode}</Badge>
								{/if}
							</div>
							{#if food.brand}
								<p class="truncate text-xs text-muted-foreground">{food.brand}</p>
							{/if}
							<p class="text-xs text-muted-foreground">
								{Math.round(food.calories)} kcal · {food.protein}P {food.carbs}C {food.fat}F
							</p>
						</div>
					</label>
				{/each}
			</RadioGroup.Root>
		</div>
	{/if}

	{#if keeper && sources.length > 0}
		<Separator class="my-4" />
		<div class="space-y-3">
			<div>
				<h3 class="text-sm font-medium">{m.foods_merge_preview_title()}</h3>
				{#if diffRows.length > 0}
					<p class="text-xs text-muted-foreground">{m.foods_merge_preview_hint()}</p>
				{/if}
			</div>

			{#if diffRows.length === 0}
				<p class="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
					{m.foods_merge_no_differences()}
				</p>
			{:else}
				<div class="space-y-3">
					{#each diffRows as row (row.field)}
						<div class="rounded-md border p-3">
							<div class="mb-2 text-sm font-medium">{row.label}</div>
							<RadioGroup.Root
								value={selectionKey(row)}
								onValueChange={(v) => chooseValue(row, v)}
								class="space-y-1.5"
							>
								{#each row.choices as choice (choice.key)}
									<label class="flex cursor-pointer items-start gap-2 text-sm">
										<RadioGroup.Item value={choice.key} class="mt-0.5" />
										<span class="min-w-0 flex-1">
											<span class="text-muted-foreground">{choice.label}:</span>
											<span class="ml-1 break-words">{fmt(choice.value)}</span>
										</span>
									</label>
								{/each}
								<label class="flex cursor-pointer items-start gap-2 text-sm">
									<RadioGroup.Item value="__custom__" class="mt-0.5" />
									<span class="min-w-0 flex-1">
										<span class="text-muted-foreground">{m.foods_merge_field_custom()}:</span>
										<Input
											class="mt-1 h-8 text-sm"
											value={selectionKey(row) === '__custom__' ? customDisplayValue(row) : ''}
											oninput={(e) =>
												setCustomValue(row, (e.currentTarget as HTMLInputElement).value)}
											onfocus={() => chooseValue(row, '__custom__')}
										/>
									</span>
								</label>
							</RadioGroup.Root>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="mt-6 flex justify-end gap-2">
		<Button variant="outline" onclick={() => onClose()} disabled={merging}>
			{m.foods_merge_cancel()}
		</Button>
		<Button onclick={performMerge} disabled={merging || !keeper || sources.length === 0}>
			{m.foods_merge_confirm()}
		</Button>
	</div>
</ResponsiveModal>
