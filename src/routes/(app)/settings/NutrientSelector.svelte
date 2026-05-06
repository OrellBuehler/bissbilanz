<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { toast } from 'svelte-sonner';
	import {
		ALL_NUTRIENTS,
		CATEGORY_ORDER,
		NUTRIENTS_BY_CATEGORY,
		DEFAULT_VISIBLE_NUTRIENTS
	} from '$lib/nutrients';
	import { nutrientLabel, categoryLabel } from '$lib/nutrients-i18n';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		initialVisible: string[] | null | undefined;
		onSave: (keys: string[]) => Promise<boolean>;
	};

	let { initialVisible, onSave }: Props = $props();

	let visibleNutrients = $state<Set<string>>(new Set(DEFAULT_VISIBLE_NUTRIENTS));
	let saving = $state(false);

	$effect(() => {
		if (initialVisible) {
			visibleNutrients = new Set(initialVisible);
		}
	});

	function toggleNutrient(key: string) {
		const next = new Set(visibleNutrients);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		visibleNutrients = next;
	}

	function selectAll() {
		visibleNutrients = new Set(ALL_NUTRIENTS.map((n) => n.key));
	}

	function deselectAll() {
		visibleNutrients = new Set();
	}

	async function save() {
		saving = true;
		try {
			const ok = await onSave([...visibleNutrients]);
			if (ok) toast.success(m.settings_saved(), { duration: 1500 });
			else toast.error(m.settings_save_failed());
		} catch {
			toast.error(m.settings_save_failed());
		} finally {
			saving = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_visible_nutrients()}</Card.Title>
		<Card.Description>{m.settings_visible_nutrients_desc()}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={selectAll}>
				{m.settings_select_all()}
			</Button>
			<Button variant="outline" size="sm" onclick={deselectAll}>
				{m.settings_deselect_all()}
			</Button>
		</div>
		{#each CATEGORY_ORDER as category}
			{@const nutrients = NUTRIENTS_BY_CATEGORY[category]}
			<div>
				<p class="mb-2 text-sm font-medium">{categoryLabel(category)}</p>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each nutrients as nutrient}
						<div class="flex items-center gap-2">
							<Checkbox
								id={`nutrient-${nutrient.key}`}
								checked={visibleNutrients.has(nutrient.key)}
								onCheckedChange={() => toggleNutrient(nutrient.key)}
							/>
							<Label for={`nutrient-${nutrient.key}`} class="text-sm">
								{nutrientLabel(nutrient)}
							</Label>
						</div>
					{/each}
				</div>
			</div>
		{/each}
		<div class="flex justify-end">
			<Button onclick={save} disabled={saving}>
				{saving ? m.goals_saving() : m.goals_save()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
