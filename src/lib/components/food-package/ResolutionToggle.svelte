<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Replace from '@lucide/svelte/icons/replace';
	import CopyPlus from '@lucide/svelte/icons/copy-plus';
	import * as m from '$lib/paraglide/messages';
	import type { PackageAction } from './foodPackage';

	type Props = {
		value: PackageAction | null;
		allowed?: PackageAction[];
		onChange: (action: PackageAction) => void;
		size?: 'sm' | 'default';
	};

	let {
		value,
		allowed = ['skip', 'replace', 'keep_both'],
		onChange,
		size = 'sm'
	}: Props = $props();

	const options = [
		{
			action: 'skip',
			icon: SkipForward,
			label: m.food_package_skip,
			hint: m.food_package_skip_hint
		},
		{
			action: 'replace',
			icon: Replace,
			label: m.food_package_replace,
			hint: m.food_package_replace_hint
		},
		{
			action: 'keep_both',
			icon: CopyPlus,
			label: m.food_package_keep_both,
			hint: m.food_package_keep_both_hint
		}
	] as const;
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	{size}
	class="w-full"
	value={value ?? ''}
	onValueChange={(next) => {
		if (next) onChange(next as PackageAction);
	}}
>
	{#each options as option (option.action)}
		{@const Icon = option.icon}
		<ToggleGroup.Item
			value={option.action}
			class="flex-1 gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
			disabled={!allowed.includes(option.action)}
			title={option.hint()}
			aria-label={option.label()}
		>
			<Icon class="size-4" />
			<span class="truncate text-xs sm:text-sm">{option.label()}</span>
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
