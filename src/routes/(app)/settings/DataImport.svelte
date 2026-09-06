<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Upload from '@lucide/svelte/icons/upload';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { toast } from 'svelte-sonner';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import { weightService } from '$lib/services/weight-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { components } from '$lib/api/generated/schema';

	type ImportSummary = components['schemas']['ImportSummaryResponse'];

	let fileInput = $state<HTMLInputElement | null>(null);
	let selected = $state<File | null>(null);
	let preview = $state<ImportSummary | null>(null);
	let busy = $state(false);

	const sectionLabels: Record<string, () => string> = {
		foods: m.import_section_foods,
		recipes: m.import_section_recipes,
		supplements: m.import_section_supplements,
		entries: m.import_section_entries,
		weight: m.import_section_weight,
		sleep: m.import_section_sleep,
		dayProperties: m.import_section_day_properties
	};

	const sectionLabel = (name: string) => sectionLabels[name]?.() ?? name;

	const send = async (file: File, mode: 'preview' | 'commit'): Promise<ImportSummary> => {
		const body = new FormData();
		body.append('file', file);
		body.append('mode', mode);
		const response = await fetch('/api/account/import', { method: 'POST', body });
		const data = await response.json();
		if (!response.ok) throw new Error(data?.error ?? 'Request failed');
		return data as ImportSummary;
	};

	const reset = () => {
		selected = null;
		preview = null;
		if (fileInput) fileInput.value = '';
	};

	const onFileChange = async (event: Event) => {
		const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		preview = null;
		selected = file;
		if (!file) return;
		busy = true;
		try {
			preview = await send(file, 'preview');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : m.settings_import_failed());
			reset();
		} finally {
			busy = false;
		}
	};

	const commit = async () => {
		if (!selected) return;
		busy = true;
		try {
			const result = await send(selected, 'commit');
			toast.success(m.settings_import_success({ count: String(result.imported) }));
			await Promise.all([weightService.refresh(), sleepService.refresh()]);
			reset();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : m.settings_import_failed());
		} finally {
			busy = false;
		}
	};
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_import_data()}</Card.Title>
		<p class="text-muted-foreground text-sm">{m.settings_import_data_desc()}</p>
	</Card.Header>
	<Card.Content class="space-y-4">
		<Input
			bind:ref={fileInput}
			type="file"
			accept=".zip,.json,.csv,text/csv,application/json,application/zip"
			disabled={busy}
			onchange={onFileChange}
			aria-label={m.settings_import_choose_file()}
		/>

		{#if busy && !preview}
			<div class="text-muted-foreground flex items-center gap-2 text-sm">
				<LoaderCircle class="size-4 animate-spin" />
				{m.settings_import_analyzing()}
			</div>
		{/if}

		{#if preview}
			<div class="space-y-3 rounded-lg border border-border/60 p-3">
				<p class="text-sm font-medium">
					{m.settings_import_preview_title({ rows: String(preview.totalRows) })}
				</p>

				{#if preview.sections.length > 0}
					<ul class="space-y-1 text-sm">
						{#each preview.sections as section (section.name)}
							<li class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">{sectionLabel(section.name)}</span>
								<span class="tabular-nums">
									{m.settings_import_section_counts({
										add: String(section.toImport),
										skip: String(section.skipped)
									})}
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-muted-foreground text-sm">{m.settings_import_nothing_to_import()}</p>
				{/if}

				{#if preview.samples.length > 0}
					<div>
						<p class="text-muted-foreground mb-1 text-xs font-medium">
							{m.settings_import_samples()}
						</p>
						<ul class="text-muted-foreground space-y-0.5 text-xs">
							{#each preview.samples as sample (sample)}
								<li class="truncate">{sample}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if preview.issues.length > 0}
					<div>
						<p class="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600">
							<TriangleAlert class="size-3.5" />
							{m.settings_import_issues({ count: String(preview.issues.length) })}
						</p>
						<ul class="text-muted-foreground space-y-0.5 text-xs">
							{#each preview.issues.slice(0, 10) as issue, index (index)}
								<li class="truncate">
									{issue.row > 0
										? `${m.settings_import_row({ row: String(issue.row) })}: `
										: ''}{issue.message}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="flex flex-wrap gap-2">
					<Button
						disabled={busy || preview.sections.every((section) => section.toImport === 0)}
						onclick={commit}
					>
						{#if busy}
							<LoaderCircle class="size-4 animate-spin" />
						{:else}
							<Upload class="size-4" />
						{/if}
						{m.settings_import_confirm()}
					</Button>
					<Button variant="outline" disabled={busy} onclick={reset}>{m.cancel()}</Button>
				</div>
			</div>
		{:else}
			<p class="text-muted-foreground text-xs">{m.settings_import_formats_hint()}</p>
		{/if}
	</Card.Content>
</Card.Root>
