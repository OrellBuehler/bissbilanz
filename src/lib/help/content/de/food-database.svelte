<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Warum du deine eigene Datenbank aufbaust</h2>
<p class="mb-6">
	Bissbilanz liefert keinen Katalog mit Millionen halbrichtiger Einträge mit — du baust stattdessen
	deine eigene Lebensmitteldatenbank auf. Jedes Lebensmittel, das du einmal hinzufügst, gehört dir,
	mit deinen Portionsgrössen und den Werten von der Verpackung, die du tatsächlich gekauft hast, und
	ist danach nur noch einen Tipp entfernt. Barcode-Scan, Etikett-Scan und die Open-Food-Facts-Suche
	sind dazu da, diesen ersten Eintrag für dich vorzubereiten, nicht ihn zu ersetzen.
</p>
<p class="mb-6">
	Am schnellsten baust du sie mit einem über MCP verbundenen KI-Assistenten auf (siehe
	<a href="/help/ai-assistant" class="underline">KI-Assistent</a>): Beschreibe in normaler Sprache,
	was du gegessen hast, und der Assistent legt die Lebensmittel und Rezepte an und erfasst die
	Einträge für dich. Nach ein paar Wochen normaler Nutzung ist das meiste, was du regelmässig isst,
	bereits in deiner eigenen Liste — und genauer als eine generische Datenbank, weil die Werte die
	sind, die du selbst eingegeben hast.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Ein Lebensmittel bearbeiten</h2>
<p class="mb-6">
	Tippe auf der Seite <strong>Lebensmittel</strong> auf ein beliebiges Lebensmittel, um Name, Marke, Portionsgrösse,
	Makros, erweiterte Nährstoffe, Barcode und Bild zu bearbeiten. Ein Wert sah nach einem Scan falsch aus?
	Korrigiere ihn hier — die Änderung betrifft nur deine Kopie, und jeder Eintrag, der bereits den alten
	Wert verwendet hat, behält ihn (nur neue Einträge nutzen den korrigierten Wert).
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Duplikate und Zusammenführen</h2>
<p class="mb-6">
	Landet dasselbe Lebensmittel doppelt in deiner Liste — einmal von Hand, einmal aus einem Scan —,
	markiert ein Banner oben auf der Seite Lebensmittel mögliche Duplikate. Öffne es, um sie
	zusammenzuführen: Wähle, welches erhalten bleibt, und jeder Tagebucheintrag, jedes Rezept und
	jeder Favorit, der auf das andere verwiesen hat, wird übernommen, bevor es entfernt wird.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Labels</h2>
<p class="mb-3">
	Labels sind kurze englische Wörter dafür, was ein Lebensmittel physisch ist — <em>banana</em>,
	<em>bread</em>, <em>bottle</em> — auch wenn sein Name auf Deutsch ist. Sie machen die Suche schlauer:
	Die Suche nach "bread" findet ein Lebensmittel namens "Vollkornbrot", sobald es gelabelt ist. Ein Barcode-Scan
	füllt sie automatisch aus der Kategorie des Produkts; von Hand bearbeitest du sie im Bearbeitungsformular
	des Lebensmittels.
</p>
<p class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
	<Badge variant="outline">iPhone</Badge>
	Visual Intelligence kann ausserdem erkennen, was die Kamera sieht, und es mit einem gelabelten Lebensmittel
	in deiner Datenbank abgleichen — siehe
	<a href="/help/mobile-extras" class="underline">iPhone- &amp; Android-Extras</a>.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Fotos</h2>
<p class="mb-6">
	Füge einem Lebensmittel im Bearbeitungsformular ein Foto hinzu — es erscheint überall dort, wo das
	Lebensmittel aufgeführt ist, was es schneller macht, eine lange Liste nach dem richtigen Eintrag
	zu durchsuchen, als nur Namen zu lesen.
</p>
