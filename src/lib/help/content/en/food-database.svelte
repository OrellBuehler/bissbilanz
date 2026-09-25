<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Why you build your own database</h2>
<p class="mb-6">
	Bissbilanz doesn't ship a catalogue of millions of half-correct entries — you build your own food
	database instead. Every food you add once is yours, with your serving sizes and the values from
	the packaging you actually bought, and it's a tap away from then on. Barcode scanning, label
	scanning and the Open Food Facts lookup are there to fill in that first entry for you, not to
	replace it.
</p>
<p class="mb-6">
	The quickest way to build it up is an AI assistant connected over MCP (see
	<a href="/help/ai-assistant" class="underline">AI assistant</a>): describe what you ate in plain
	language and the assistant creates the foods and recipes and logs the entries for you. After a
	couple of weeks of normal use, most of what you eat regularly is already in your own list — and
	it's more accurate than a generic database, because the values are the ones you entered.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Editing a food</h2>
<p class="mb-6">
	Tap any food on the <strong>Foods</strong> page to edit its name, brand, serving size, macros, extended
	nutrients, barcode and image. A value looked wrong after a scan? Fix it here — the change only affects
	your copy, and every entry that already used the old value keeps it (only new entries use the corrected
	one).
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Duplicates and merging</h2>
<p class="mb-6">
	If the same food ends up added twice — once by hand, once from a scan — a banner at the top of the
	Foods page flags likely duplicates. Open it to merge them: pick which one to keep, and every diary
	entry, recipe and favorite that pointed at the other one is moved over before it's removed.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Labels</h2>
<p class="mb-3">
	Labels are short English words for what a food physically is — <em>banana</em>, <em>bread</em>,
	<em>bottle</em> — even if its name is in German. They make search smarter: searching "bread" finds a
	food named "Vollkornbrot" once it's labelled. Scanning a barcode fills them in automatically from the
	product's category; edit them yourself from the food's edit form.
</p>
<p class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
	<Badge variant="outline">iPhone</Badge>
	Visual Intelligence can also match what the camera sees to a labelled food in your database — see
	<a href="/help/mobile-extras" class="underline">iPhone &amp; Android extras</a>.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Photos</h2>
<p class="mb-6">
	Add a photo to a food from its edit form — it shows up next to the food everywhere it's listed,
	which makes scanning a long list for the right item faster than reading names.
</p>
