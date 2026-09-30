<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Clock from '@lucide/svelte/icons/clock';
	import FileUp from '@lucide/svelte/icons/file-up';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Share2 from '@lucide/svelte/icons/share-2';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileArchive from '@lucide/svelte/icons/file-archive';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		selecting: boolean;
		onImportCsv: () => void;
		onImportPackage: () => void;
		onShare: () => void;
		onToggleSelecting: () => void;
	};

	let { selecting, onImportCsv, onImportPackage, onShare, onToggleSelecting }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-2">
	<Button variant="outline" size="sm" href="/foods/recent">
		<Clock class="size-4 sm:mr-1" />
		<span class="hidden sm:inline">{m.foods_recent_link()}</span>
	</Button>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm" aria-label={m.foods_import()}>
					<FileUp class="size-4 sm:mr-1" />
					<span class="hidden sm:inline">{m.foods_import()}</span>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
			<DropdownMenu.Item onclick={onImportCsv}>
				<FileSpreadsheet class="size-4" />
				{m.food_package_import_csv()}
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={onImportPackage}>
				<FileArchive class="size-4" />
				{m.food_package_import()}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<Button variant="outline" size="sm" aria-label={m.food_package_share()} onclick={onShare}>
		<Share2 class="size-4 sm:mr-1" />
		<span class="hidden sm:inline">{m.food_package_share()}</span>
	</Button>
	<Button
		variant={selecting ? 'default' : 'outline'}
		size="sm"
		class="ml-auto"
		aria-pressed={selecting}
		onclick={onToggleSelecting}
	>
		<ListChecks class="size-4 sm:mr-1" />
		<span class="hidden sm:inline">
			{selecting ? m.foods_select_done() : m.foods_select()}
		</span>
	</Button>
</div>
