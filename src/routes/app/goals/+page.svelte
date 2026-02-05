<script lang="ts">
	let form = {
		calorieGoal: 2000,
		proteinGoal: 150,
		carbGoal: 220,
		fatGoal: 60,
		fiberGoal: 30
	};

	const saveGoals = async () => {
		await fetch('/api/goals', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(form)
		});
	};
</script>

<div class="mx-auto max-w-xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Goals</h1>
	<div class="grid gap-4">
		<label class="grid gap-2">
			<span>Calories</span>
			<input class="rounded border p-2" type="number" bind:value={form.calorieGoal} />
		</label>
		<label class="grid gap-2">
			<span>Protein (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.proteinGoal} />
		</label>
		<label class="grid gap-2">
			<span>Carbs (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.carbGoal} />
		</label>
		<label class="grid gap-2">
			<span>Fat (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.fatGoal} />
		</label>
		<label class="grid gap-2">
			<span>Fiber (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.fiberGoal} />
		</label>
	</div>
	<button class="rounded bg-black px-4 py-2 text-white" onclick={saveGoals}>Save</button>
</div>
