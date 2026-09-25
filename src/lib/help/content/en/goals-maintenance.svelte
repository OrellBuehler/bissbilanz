<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Macro goals</h2>
<p class="mb-6">
	On the <strong>Goals</strong> page, set a daily calorie target, then protein, carbs and fat with
	the sliders (fiber follows the carb goal and can be pulled down independently). These are what
	your dashboard rings, history and insights compare your logged days against. You can also set an
	optional target weight and date — the <a href="/help/body-tracking" class="underline">Weight</a>
	page then shows a projection of whether your current rate of change gets you there in time.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Crediting workout calories</h2>
<p class="mb-6">
	Still on the Goals page, <strong>Credit workout calories toward today's goal</strong> raises your calorie
	(and proportionally, macro) goal on days you were active, instead of leaving you to eat back exercise
	calories out of your normal budget. The slider below it controls what share of a workout gets credited
	— 100% credits every calorie burned, lower values are more conservative.
</p>
<p class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
	<Badge variant="outline">iPhone</Badge>
	<Badge variant="outline">Android</Badge>
	The mobile apps can fill in activity calories automatically from Apple Health or Health Connect; on
	the web, add them yourself in a day's <strong>day properties</strong> card.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Maintenance calories</h2>
<p class="mb-6">
	The <strong>Maintenance</strong> page estimates how many calories you burn a day from your actual logged
	intake and your weight trend over a date range — pick a preset (2, 4, 8 or 12 weeks) or a custom range.
	It splits your weight change into fat and muscle using the body-composition slider (lean mass changes
	more slowly, so this affects the estimate), and shows the breakdown alongside the result.
</p>
<p class="mb-6">
	The estimate gets more reliable the more consistently you both log food and weigh in over the
	range — a warning appears when coverage is too low to trust the number. It's meant to be
	recalculated every few weeks as new data comes in, not set once and forgotten.
</p>
