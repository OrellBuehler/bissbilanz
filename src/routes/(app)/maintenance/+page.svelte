<script lang="ts">
	import { today, shiftDate } from '$lib/utils/dates';
	import { DEFAULT_MUSCLE_RATIO } from '$lib/utils/maintenance';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import Calculator from '@lucide/svelte/icons/calculator';
	import Flame from '@lucide/svelte/icons/flame';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import Scale from '@lucide/svelte/icons/scale';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Loader from '@lucide/svelte/icons/loader';
	import * as m from '$lib/paraglide/messages';

	type MaintenanceResult = {
		maintenanceCalories: number;
		dailyDeficit: number;
		totalEnergyBalance: number;
		fatMassKg: number;
		muscleMassKg: number;
		fatCalories: number;
		muscleCalories: number;
		avgDailyCalories: number;
		weightChangeKg: number;
		days: number;
		muscleRatio: number;
	};

	type Meta = {
		weightEntries: number;
		foodEntryDays: number;
		totalDays: number;
		coverage: number;
		firstWeight: number;
		lastWeight: number;
		startDate: string;
		endDate: string;
	};

	let endDate = $state(today());
	// svelte-ignore state_referenced_locally
	let startDate = $state(shiftDate(endDate, -27));
	let muscleRatio = $state(DEFAULT_MUSCLE_RATIO * 100);

	let result = $state<MaintenanceResult | null>(null);
	let meta = $state<Meta | null>(null);
	let loading = $state(false);
	let error: string | null = $state(null);

	const fatRatio = $derived(100 - muscleRatio);
	const dailyDeficit = $derived(result?.dailyDeficit ?? 0);
	const isDeficit = $derived(dailyDeficit > 0);
	const isGain = $derived(dailyDeficit < 0);
	const lowCoverage = $derived(meta != null && meta.coverage < 0.7);

	const presets = [
		{ label: () => m.maintenance_2_weeks(), days: 13 },
		{ label: () => m.maintenance_4_weeks(), days: 27 },
		{ label: () => m.maintenance_8_weeks(), days: 55 },
		{ label: () => m.maintenance_12_weeks(), days: 83 }
	];

	function selectPreset(days: number) {
		endDate = today();
		startDate = shiftDate(endDate, -days);
	}

	async function calculate() {
		loading = true;
		error = null;
		result = null;
		meta = null;

		try {
			const ratio = muscleRatio / 100;
			// Uses bare fetch instead of apiFetch intentionally: maintenance calculation
			// requires server-side computation across weight + food entry data and is not
			// suitable for offline use.
			const res = await fetch(
				`/api/maintenance?startDate=${startDate}&endDate=${endDate}&muscleRatio=${ratio}`
			);
			const data = await res.json();

			if (!res.ok) {
				error = data.message || data.error;
				return;
			}

			result = data.result;
			meta = data.meta;
		} catch {
			error = m.maintenance_calculate_error();
		} finally {
			loading = false;
		}
	}

	function formatKcal(value: number): string {
		return Math.abs(value).toLocaleString();
	}

	function formatKg(value: number): string {
		return Math.abs(value).toFixed(2);
	}
</script>

<div class="mx-auto max-w-2xl space-y-6 pb-8">
	<Card.Root class="overflow-hidden">
		<Card.Header class="pb-3">
			<div class="flex items-center gap-2">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
				>
					<Calculator class="size-4" />
				</div>
				<Card.Title class="text-base tracking-tight">
					{m.maintenance_title()}
				</Card.Title>
			</div>
			<Card.Description>
				{m.maintenance_description()}
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-5 p-4 pt-0 sm:p-5 sm:pt-0">
			<div class="space-y-3">
				<Label class="text-sm font-medium">{m.maintenance_date_range()}</Label>
				<div class="flex flex-wrap gap-2">
					{#each presets as preset}
						<Button
							variant="outline"
							size="sm"
							class="text-xs"
							onclick={() => selectPreset(preset.days)}
						>
							{preset.label()}
						</Button>
					{/each}
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<Label for="start-date" class="text-muted-foreground text-xs">
							{m.maintenance_start()}
						</Label>
						<input
							id="start-date"
							type="date"
							bind:value={startDate}
							class="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<Label for="end-date" class="text-muted-foreground text-xs">
							{m.maintenance_end()}
						</Label>
						<input
							id="end-date"
							type="date"
							bind:value={endDate}
							class="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</div>

			<div class="space-y-3">
				<Label class="text-sm font-medium">
					{m.maintenance_body_composition()}
				</Label>
				<div class="space-y-2">
					<div class="flex justify-between text-xs text-muted-foreground">
						<span>{m.maintenance_muscle()}: {muscleRatio}%</span>
						<span>{m.maintenance_fat()}: {fatRatio}%</span>
					</div>
					<Slider
						type="single"
						bind:value={muscleRatio}
						min={0}
						max={100}
						step={5}
						class="w-full"
					/>
					<p class="text-xs text-muted-foreground">
						{m.maintenance_ratio_hint()}
					</p>
				</div>
			</div>

			<Button class="w-full" onclick={calculate} disabled={loading}>
				{#if loading}
					<Loader class="size-4 animate-spin" />
				{/if}
				{m.maintenance_calculate()}
			</Button>
		</Card.Content>
	</Card.Root>

	{#if error}
		<Card.Root class="border-destructive/50">
			<Card.Content class="flex items-start gap-3 p-4">
				<Info class="mt-0.5 size-4 shrink-0 text-destructive" />
				<p class="text-sm text-destructive">{error}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if result && meta}
		{#if lowCoverage}
			<Card.Root class="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10">
				<Card.Content class="flex items-start gap-3 p-4">
					<TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<p class="text-sm text-amber-700 dark:text-amber-300">
						{m.maintenance_low_coverage_warning({
							days: meta.foodEntryDays,
							total: meta.totalDays
						})}
					</p>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root
			class="overflow-hidden border-border/60 bg-linear-to-br from-blue-50/80 via-background to-emerald-50/60 dark:from-blue-950/20 dark:via-background dark:to-emerald-950/10"
		>
			<Card.Content class="relative p-4 sm:p-6">
				<div
					class="absolute -top-14 -right-10 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl"
				></div>
				<div class="relative space-y-4">
					<div class="text-center">
						<p class="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">
							{m.maintenance_estimated()}
						</p>
						<p class="text-4xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
							{formatKcal(result.maintenanceCalories)}
						</p>
						<p class="text-muted-foreground text-sm">{m.maintenance_kcal_day()}</p>
					</div>

					<div class="grid grid-cols-3 gap-2">
						<div
							class="rounded-xl border border-border/60 bg-background/85 p-3 text-center backdrop-blur"
						>
							<div
								class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
							>
								{m.maintenance_avg_intake()}
							</div>
							<div class="text-sm font-semibold tabular-nums">
								{formatKcal(result.avgDailyCalories)}
							</div>
						</div>
						<div
							class="rounded-xl border border-border/60 bg-background/85 p-3 text-center backdrop-blur"
						>
							<div
								class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
							>
								{isDeficit ? m.maintenance_deficit() : m.maintenance_surplus()}
							</div>
							<div
								class="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums"
							>
								{#if isDeficit}
									<TrendingDown class="size-3.5 text-emerald-500" />
								{:else if isGain}
									<TrendingUp class="size-3.5 text-amber-500" />
								{/if}
								{formatKcal(result.dailyDeficit)}/d
							</div>
						</div>
						<div
							class="rounded-xl border border-border/60 bg-background/85 p-3 text-center backdrop-blur"
						>
							<div
								class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
							>
								{m.maintenance_weight_change()}
							</div>
							<div
								class="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums"
							>
								<Scale class="size-3.5" />
								{result.weightChangeKg > 0 ? '+' : ''}{result.weightChangeKg.toFixed(1)} kg
							</div>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="overflow-hidden">
			<Card.Header class="pb-3">
				<div class="flex items-center gap-2">
					<div
						class="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"
					>
						<Flame class="size-4" />
					</div>
					<Card.Title class="text-base tracking-tight">
						{m.maintenance_breakdown()}
					</Card.Title>
				</div>
			</Card.Header>
			<Card.Content class="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
				<div class="space-y-2">
					<div class="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
						<span class="text-sm">{m.maintenance_fat_component()}</span>
						<span class="font-mono text-sm font-semibold">
							{formatKg(result.fatMassKg)} kg = {formatKcal(result.fatCalories)} kcal
						</span>
					</div>
					<div class="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
						<span class="text-sm">{m.maintenance_muscle_component()}</span>
						<span class="font-mono text-sm font-semibold">
							{formatKg(result.muscleMassKg)} kg = {formatKcal(result.muscleCalories)} kcal
						</span>
					</div>
					<div
						class="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
					>
						<span class="text-sm font-medium">{m.maintenance_total_energy()}</span>
						<span class="font-mono text-sm font-bold">
							{#if result.totalEnergyBalance > 0}
								{m.maintenance_energy_balance_deficit({
									value: formatKcal(result.totalEnergyBalance)
								})}
							{:else if result.totalEnergyBalance < 0}
								{m.maintenance_energy_balance_surplus({
									value: formatKcal(result.totalEnergyBalance)
								})}
							{:else}
								{formatKcal(result.totalEnergyBalance)} kcal
							{/if}
						</span>
					</div>
				</div>

				<div class="mt-4 space-y-1 text-xs text-muted-foreground">
					<p>
						{m.maintenance_data_note({
							weightEntries: meta.weightEntries,
							foodDays: meta.foodEntryDays,
							days: meta.totalDays
						})}
					</p>
					<p>
						{m.maintenance_weight_range({
							first: meta.firstWeight.toFixed(1),
							last: meta.lastWeight.toFixed(1)
						})}
					</p>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
