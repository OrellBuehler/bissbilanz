<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		labels: string[];
		onChange: (labels: string[]) => void;
	};

	let { labels, onChange }: Props = $props();

	let draft = $state('');

	// The server normalizes on write (lowercase, singular, deduped); this only
	// keeps the visible list from showing the same label twice before save.
	function add() {
		const value = draft.trim().toLowerCase();
		draft = '';
		if (!value || labels.includes(value)) return;
		onChange([...labels, value]);
	}

	function remove(label: string) {
		onChange(labels.filter((l) => l !== label));
	}
</script>

<div class="grid gap-1.5">
	<Label for="food-label-input">{m.food_form_labels()}</Label>
	{#if labels.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each labels as label (label)}
				<Badge variant="secondary" class="gap-1 pr-1">
					{label}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						class="size-5 rounded-full"
						aria-label={m.food_form_label_remove({ label })}
						onclick={() => remove(label)}
					>
						<X class="size-3" />
					</Button>
				</Badge>
			{/each}
		</div>
	{/if}
	<div class="flex min-w-0 gap-2">
		<Input
			id="food-label-input"
			bind:value={draft}
			placeholder={m.food_form_label_placeholder()}
			class="min-w-0 flex-1"
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					add();
				}
			}}
		/>
		<Button
			type="button"
			variant="outline"
			size="icon"
			disabled={!draft.trim()}
			aria-label={m.food_form_label_add()}
			onclick={add}
		>
			<Plus class="size-4" />
		</Button>
	</div>
	<p class="text-xs text-muted-foreground">{m.food_form_labels_hint()}</p>
</div>
