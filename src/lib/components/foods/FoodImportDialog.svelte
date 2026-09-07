<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Upload from '@lucide/svelte/icons/upload';
	import Download from '@lucide/svelte/icons/download';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import * as m from '$lib/paraglide/messages';
	import {
		buildFoodCsvTemplate,
		parseFoodCsv,
		type FoodCsvError,
		type FoodCsvParseResult
	} from '$lib/foods/csv';

	type Props = {
		open: boolean;
		importing?: boolean;
		onImport: (foods: FoodCsvParseResult['rows'][number]['food'][]) => void;
	};

	let { open = $bindable(false), importing = false, onImport }: Props = $props();

	let fileName = $state('');
	let parsed = $state<FoodCsvParseResult | null>(null);

	$effect(() => {
		if (!open) {
			fileName = '';
			parsed = null;
		}
	});

	async function handleFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		fileName = file.name;
		parsed = parseFoodCsv(await file.text());
		// Let the same file be picked again after a fix.
		input.value = '';
	}

	function downloadTemplate() {
		const blob = new Blob([buildFoodCsvTemplate()], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'bissbilanz-foods-template.csv';
		link.click();
		URL.revokeObjectURL(url);
	}

	function describe(error: FoodCsvError) {
		const column = error.column ?? '';
		switch (error.code) {
			case 'missing_header':
				return m.foods_csv_error_missing_header();
			case 'missing_required_column':
				return m.foods_csv_error_missing_required_column({ column });
			case 'missing_name':
				return m.foods_csv_error_missing_name();
			case 'invalid_number':
				return m.foods_csv_error_invalid_number({ column });
			case 'negative_number':
				return m.foods_csv_error_negative_number({ column });
			case 'invalid_serving_size':
				return m.foods_csv_error_invalid_serving_size();
			case 'invalid_serving_unit':
				return m.foods_csv_error_invalid_serving_unit();
		}
	}
</script>

<ResponsiveModal
	bind:open
	title={m.foods_import_title()}
	description={m.foods_import_description()}
>
	<div class="space-y-4">
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" onclick={downloadTemplate}>
				<Download class="mr-2 size-4" />
				{m.foods_import_template()}
			</Button>
			<Button variant="outline" class="relative overflow-hidden">
				<Upload class="mr-2 size-4" />
				{m.foods_import_choose_file()}
				<input
					type="file"
					accept=".csv,text/csv"
					aria-label={m.foods_import_choose_file()}
					class="absolute inset-0 cursor-pointer opacity-0"
					onchange={handleFile}
				/>
			</Button>
		</div>

		{#if fileName}
			<p class="truncate text-xs text-muted-foreground">{fileName}</p>
		{/if}

		{#if parsed}
			<div class="space-y-2 rounded-lg border p-3">
				<p class="text-sm font-medium">
					{m.foods_import_valid_rows({ count: parsed.rows.length })}
				</p>
				{#if parsed.unknownColumns.length > 0}
					<p class="text-xs text-muted-foreground">
						{m.foods_import_unknown_columns({ columns: parsed.unknownColumns.join(', ') })}
					</p>
				{/if}
				{#if parsed.errors.length > 0}
					<div class="space-y-1">
						<p class="flex items-center gap-1.5 text-xs font-medium text-amber-600">
							<TriangleAlert class="size-3.5" />
							{m.foods_import_error_rows({ count: parsed.errors.length })}
						</p>
						<ul class="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
							{#each parsed.errors.slice(0, 50) as error (`${error.line}:${error.column ?? ''}:${error.code}`)}
								<li>
									<span class="font-medium">{m.foods_import_row({ line: error.line })}</span>
									— {describe(error)}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<Button
				class="w-full"
				disabled={importing || parsed.rows.length === 0}
				onclick={() => onImport(parsed?.rows.map((row) => row.food) ?? [])}
			>
				{m.foods_import_submit({ count: parsed.rows.length })}
			</Button>
		{/if}
	</div>
</ResponsiveModal>
