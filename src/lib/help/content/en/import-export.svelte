<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Importing data</h2>
<p class="mb-6">
	<strong>Settings → Import data</strong> accepts a Bissbilanz export (the <code>.zip</code> from
	Export data below, or the <code>bissbilanz.json</code> inside it), a weight CSV, or a sleep CSV.
	Every import runs in two steps: the file is analysed and you get a preview — row count, sample
	rows, anything that couldn't be read — and only <strong>Import now</strong> writes anything.
</p>
<p class="mb-6">
	Imports are idempotent: a row that already exists (by date for weight/sleep/fasting, by id for
	foods, recipes, supplements and entries) is skipped rather than duplicated, so re-importing the
	same file twice changes nothing. A Bissbilanz export restores foods, recipes, supplements, food
	entries, weight, sleep and fasting days — not your preferences, goals, AI tasks or photos.
</p>
<p class="mb-6">
	Weight and sleep CSVs accept comma, semicolon or tab separators, quoted fields, and both
	<code>1234.5</code> and <code>1234,5</code> style numbers. Column names are matched loosely, and
	common German headers (<code>datum</code>, <code>gewicht</code>, <code>dauer</code>) work too.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Bulk-importing foods</h2>
<p class="mb-6">
	On the <strong>Foods</strong> page, <strong>Import CSV</strong> creates many foods from a spreadsheet
	at once — download the template for the exact column list, fill in a name, serving size and unit for
	each row (macros and extended nutrients are optional, defaulting to zero), and the file is checked in
	your browser before anything is uploaded. A food that already exists (by name, brand and serving) or
	whose barcode is already taken is reported as skipped rather than failing the whole import.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Exporting your data</h2>
<p class="mb-3">
	<strong>Settings → Export data</strong> downloads a ZIP with everything Bissbilanz stores about you:
	JSON data, CSV files and any photos you've uploaded. It's also offered before deleting your account,
	in case you want a copy first.
</p>
<p class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
	<Badge variant="outline">iPhone</Badge>
	<Badge variant="outline">Android</Badge>
	Export data is also in Settings on the mobile apps — the CSV and Bissbilanz-export imports above are
	web-only.
</p>
