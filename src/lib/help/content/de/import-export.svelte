<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Daten importieren</h2>
<p class="mb-6">
	<strong>Einstellungen → Daten importieren</strong> akzeptiert einen Bissbilanz-Export (das
	<code>.zip</code> aus "Daten exportieren" unten oder die darin enthaltene
	<code>bissbilanz.json</code>), eine Gewichts-CSV oder eine Schlaf-CSV. Jeder Import läuft in zwei
	Schritten ab: Die Datei wird analysiert und du erhältst eine Vorschau — Zeilenanzahl,
	Beispielzeilen, alles, was nicht gelesen werden konnte —, und erst
	<strong>Jetzt importieren</strong> schreibt etwas.
</p>
<p class="mb-6">
	Importe sind idempotent: Eine bereits vorhandene Zeile (nach Datum bei Gewicht/Schlaf/Fasten, nach
	ID bei Lebensmitteln, Rezepten, Supplementen und Einträgen) wird übersprungen statt dupliziert —
	dieselbe Datei zweimal zu importieren ändert also nichts. Ein Bissbilanz-Export stellt
	Lebensmittel, Rezepte, Supplemente, Einträge, Gewicht, Schlaf und Fastentage wieder her — nicht
	deine Einstellungen, Ziele, KI-Aufgaben oder Fotos.
</p>
<p class="mb-6">
	Gewichts- und Schlaf-CSVs akzeptieren Komma, Semikolon oder Tabulator als Trennzeichen,
	Anführungszeichen bei Feldern sowie Zahlen im Format <code>1234.5</code> und <code>1234,5</code>.
	Spaltennamen werden grosszügig erkannt, auch gängige deutsche Bezeichnungen (<code>datum</code>,
	<code>gewicht</code>, <code>dauer</code>) funktionieren.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Lebensmittel im grossen Umfang importieren</h2>
<p class="mb-6">
	Auf der Seite <strong>Lebensmittel</strong> legt <strong>CSV importieren</strong> viele Lebensmittel
	auf einmal aus einer Tabelle an — lade die Vorlage für die genaue Spaltenliste herunter, trage für jede
	Zeile Name, Portionsgrösse und -einheit ein (Makros und erweiterte Nährstoffe sind optional und werden
	standardmässig auf null gesetzt), und die Datei wird in deinem Browser geprüft, bevor etwas hochgeladen
	wird. Ein bereits vorhandenes Lebensmittel (nach Name, Marke und Portion) oder ein bereits vergebener
	Barcode wird als übersprungen gemeldet, statt den ganzen Import fehlschlagen zu lassen.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Deine Daten exportieren</h2>
<p class="mb-3">
	<strong>Einstellungen → Daten exportieren</strong> lädt ein ZIP mit allem herunter, was Bissbilanz über
	dich speichert: JSON-Daten, CSV-Dateien und alle hochgeladenen Fotos. Es wird auch vor dem Löschen deines
	Kontos angeboten, falls du vorher eine Kopie möchtest.
</p>
<p class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
	<Badge variant="outline">iPhone</Badge>
	<Badge variant="outline">Android</Badge>
	"Daten exportieren" gibt es auch in den Einstellungen der mobilen Apps — die CSV- und Bissbilanz-Export-Importe
	oben sind nur im Web verfügbar.
</p>
