<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';
	import { claudeOption, effectiveProcessor, type ClaudeCapability } from '$lib/utils/claude-tasks';

	type Options = {
		aiResearchNutrients: boolean;
		aiWebResearch: boolean;
		aiRealServings: boolean;
		aiTaskCreateFoods: boolean;
	};

	type Props = {
		prefs:
			| (Partial<Options> & {
					aiTaskProcessor?: string | null;
					aiTaskProcessorKind?: string | null;
					claude?: ClaudeCapability | null;
			  })
			| null
			| undefined;
		onSave: (patch: Partial<Options>) => Promise<boolean>;
	};

	let { prefs, onSave }: Props = $props();

	const visible = $derived(claudeOption(effectiveProcessor(prefs), prefs?.claude) !== 'hidden');

	const rows = $derived([
		{
			key: 'aiResearchNutrients' as const,
			id: 'ai-research-nutrients',
			label: m.settings_ai_research_nutrients_label(),
			hint: m.settings_ai_research_nutrients_hint(),
			checked: prefs?.aiResearchNutrients ?? true
		},
		{
			key: 'aiWebResearch' as const,
			id: 'ai-web-research',
			label: m.settings_ai_web_research_label(),
			hint: m.settings_ai_web_research_hint(),
			checked: prefs?.aiWebResearch ?? true
		},
		{
			key: 'aiRealServings' as const,
			id: 'ai-real-servings',
			label: m.settings_ai_real_servings_label(),
			hint: m.settings_ai_real_servings_hint(),
			checked: prefs?.aiRealServings ?? true
		},
		{
			key: 'aiTaskCreateFoods' as const,
			id: 'ai-task-create-foods',
			label: m.settings_ai_task_create_foods_label(),
			hint: m.settings_ai_task_create_foods_hint(),
			checked: prefs?.aiTaskCreateFoods ?? true
		}
	]);

	async function toggle(key: keyof Options, checked: boolean) {
		try {
			const ok = await onSave({ [key]: checked });
			if (ok) toast.success(m.settings_saved(), { duration: 1500 });
			else toast.error(m.settings_save_failed());
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.settings_save_failed());
		}
	}
</script>

{#if visible}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_ai_assistant_title()}</Card.Title>
			<Card.Description>{m.settings_ai_assistant_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#each rows as row (row.key)}
				<div class="flex items-center justify-between gap-3 rounded-md border p-3">
					<div class="space-y-0.5">
						<Label for={row.id}>{row.label}</Label>
						<p class="text-xs text-muted-foreground">{row.hint}</p>
					</div>
					<Switch
						id={row.id}
						checked={row.checked}
						onCheckedChange={(checked) => toggle(row.key, checked)}
					/>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
