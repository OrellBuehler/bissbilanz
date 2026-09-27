<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	let { title }: { title: string } = $props();
</script>

<div class="rounded-lg border border-dashed bg-card overflow-hidden">
	<div class="border-l-4 border-muted-foreground/30 p-4 sm:p-5">
		<p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
			{title}
		</p>
		<p class="text-sm font-medium text-muted-foreground">{m.insights_card_unavailable()}</p>
	</div>
</div>
