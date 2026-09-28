<script lang="ts">
	import DayWaterCard from '$lib/components/entries/DayWaterCard.svelte';
	import DayActivityCard from '$lib/components/entries/DayActivityCard.svelte';
	import DayNotesCard from '$lib/components/entries/DayNotesCard.svelte';

	let { date }: { date: string } = $props();
</script>

<DayWaterCard {date} />
<DayActivityCard {date} />
<DayNotesCard {date} />
