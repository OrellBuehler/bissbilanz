<script lang="ts">
	import { today } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
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
			error = 'Weight must be between 20 and 500 kg';
			return;
		}
		if (!entryDate) {
			error = m.error_missing_date();
			return;
		}

		saving = true;
		try {
			const res = await fetch('/api/weight', {
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

<form onsubmit={submit} class="flex flex-wrap items-end gap-3">
	<div class="flex-1 min-w-[120px]">
		<label for="weight-kg" class="mb-1 block text-sm font-medium">{m.weight_kg_label()}</label>
		<Input
			id="weight-kg"
			type="number"
			step="0.1"
			min="20"
			max="500"
			placeholder="75.0"
			bind:value={weightKg}
			required
		/>
	</div>
	<div class="min-w-[140px]">
		<label for="weight-date" class="mb-1 block text-sm font-medium">{m.weight_date_label()}</label>
		<Input id="weight-date" type="date" bind:value={entryDate} max={today()} required />
	</div>
	<div class="flex-1 min-w-[140px]">
		<label for="weight-notes" class="mb-1 block text-sm font-medium">{m.weight_notes_label()}</label>
		<Input id="weight-notes" type="text" placeholder="" bind:value={notes} />
	</div>
	<Button type="submit" disabled={saving} size="sm">
		{saving ? '...' : m.weight_save()}
	</Button>
</form>
{#if error}
	<p class="mt-1 text-sm text-destructive">{error}</p>
{/if}
