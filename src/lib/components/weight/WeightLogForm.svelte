<script lang="ts">
	import { today } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { apiFetch } from '$lib/utils/api';
	import Weight from '@lucide/svelte/icons/weight';
	import History from '@lucide/svelte/icons/history';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import * as m from '$lib/paraglide/messages';

	let { onLogged }: { onLogged: () => void } = $props();

	let weightKg = $state('');
	let entryDate = $state(today());
	let notes = $state('');
	let saving = $state(false);
	let error = $state('');

	const submit = async () => {
		error = '';
		const kg = parseFloat(weightKg);
		if (isNaN(kg) || kg < 20 || kg > 500) {
			error = m.error_weight_range();
			return;
		}
		if (!entryDate) {
			error = m.error_missing_date();
			return;
		}

		saving = true;
		try {
			const res = await apiFetch('/api/weight', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ weightKg: kg, entryDate, notes: notes || undefined })
			});
			if (!res.ok) {
				const data = await res.json();
				error = data.error || m.error_generic();
				return;
			}
			weightKg = '';
			entryDate = today();
			notes = '';
			onLogged();
		} catch {
			error = m.error_generic();
		} finally {
			saving = false;
		}
	};
</script>

<form onsubmit={submit} class="space-y-3">
	<div class="grid gap-3 md:grid-cols-12">
		<div class="md:col-span-4">
			<div
				class="rounded-xl border border-border/60 bg-gradient-to-b from-blue-50/40 to-background p-3 dark:from-blue-950/10"
			>
				<label for="weight-kg" class="mb-2 flex items-center gap-2 text-sm font-medium">
					<div
						class="flex size-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400"
					>
						<Weight class="size-3.5" />
					</div>
					{m.weight_kg_label()}
				</label>
				<div class="relative">
					<Input
						id="weight-kg"
						type="number"
						step="0.1"
						min="20"
						max="500"
						placeholder="75.0"
						bind:value={weightKg}
						required
						class="pr-11"
					/>
					<span
						class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground"
					>
						kg
					</span>
				</div>
			</div>
		</div>

		<div class="md:col-span-3">
			<div
				class="rounded-xl border border-border/60 bg-gradient-to-b from-emerald-50/35 to-background p-3 dark:from-emerald-950/10"
			>
				<label for="weight-date" class="mb-2 flex items-center gap-2 text-sm font-medium">
					<div
						class="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					>
						<History class="size-3.5" />
					</div>
					{m.weight_date_label()}
				</label>
				<Input id="weight-date" type="date" bind:value={entryDate} max={today()} required />
			</div>
		</div>

		<div class="md:col-span-5">
			<div
				class="rounded-xl border border-border/60 bg-gradient-to-b from-orange-50/35 to-background p-3 dark:from-orange-950/10"
			>
				<label for="weight-notes" class="mb-2 flex items-center gap-2 text-sm font-medium">
					<div
						class="flex size-6 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400"
					>
						<Pencil class="size-3.5" />
					</div>
					{m.weight_notes_label()}
				</label>
				<Input id="weight-notes" type="text" placeholder="" bind:value={notes} />
			</div>
		</div>
	</div>

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div
			class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
		>
			<Sparkles class="size-3.5 text-blue-600 dark:text-blue-400" />
			<span>{m.weight_page_title()}</span>
		</div>
		<Button type="submit" disabled={saving} class="w-full sm:w-auto" size="sm">
			{saving ? '...' : m.weight_save()}
		</Button>
	</div>
</form>
{#if error}
	<div
		class="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
	>
		{error}
	</div>
{/if}
