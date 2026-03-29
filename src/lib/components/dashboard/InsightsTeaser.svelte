<script lang="ts">
	import { ChartBar } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<a
	href="/insights"
	class="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-md transition-shadow hover:shadow-lg"
>
	<div class="relative z-10">
		<div class="mb-1.5 flex items-center gap-2">
			<ChartBar class="size-4 text-primary-foreground/80" />
			<span class="text-[10px] font-bold uppercase tracking-wider text-primary-foreground/80">
				{m.insights_teaser_label()}
			</span>
		</div>
		<p class="text-sm font-medium leading-snug">
			{m.insights_teaser_text()}
		</p>
	</div>
	<div class="absolute -bottom-4 -right-4 opacity-10">
		<ChartBar class="size-28" />
	</div>
</a>
