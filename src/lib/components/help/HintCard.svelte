<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import X from '@lucide/svelte/icons/x';
	import { dismiss } from '$lib/stores/hints.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		/** Stable id used for dismissal persistence — usually the help guide slug. */
		id: string;
		title: string;
		text: string;
		/** Guide path, e.g. `/help/getting-started`. */
		href: string;
	};

	let { id, title, text, href }: Props = $props();
</script>

<Alert.Root class="relative border-border/60 bg-muted/30 pr-10">
	<Lightbulb class="text-amber-500 dark:text-amber-400" />
	<Alert.Title>{title}</Alert.Title>
	<Alert.Description>
		{text}
		<a {href} class="font-medium text-foreground underline underline-offset-2">
			{m.hint_learn_more()}
		</a>
	</Alert.Description>
	<Button
		variant="ghost"
		size="icon"
		class="absolute right-1.5 top-1.5 size-7 text-muted-foreground hover:text-foreground"
		aria-label={m.hint_dismiss()}
		onclick={() => dismiss(id)}
	>
		<X class="size-4" />
	</Button>
</Alert.Root>
