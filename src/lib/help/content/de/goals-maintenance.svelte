<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Makroziele</h2>
<p class="mb-6">
	Lege auf der Seite <strong>Ziele</strong> ein tägliches Kalorienziel fest, danach Protein,
	Kohlenhydrate und Fett mit den Reglern (Ballaststoffe folgen dem Kohlenhydratziel und können
	unabhängig davon nach unten korrigiert werden). Damit werden deine Dashboard-Ringe, der Verlauf
	und die Einblicke deine erfassten Tage vergleichen. Du kannst zusätzlich ein optionales
	Zielgewicht mit Datum festlegen — die Seite
	<a href="/help/body-tracking" class="underline">Gewicht</a> zeigt dann eine Prognose, ob du mit deiner
	aktuellen Veränderungsrate rechtzeitig ankommst.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Trainingskalorien anrechnen</h2>
<p class="mb-6">
	Ebenfalls auf der Seite Ziele erhöht <strong>Trainingskalorien dem heutigen Ziel anrechnen</strong
	>
	dein Kalorien- (und proportional dein Makro-)Ziel an Tagen, an denen du aktiv warst, statt dass du verbrannte
	Kalorien aus deinem normalen Budget nachessen musst. Der Regler darunter bestimmt, wie viel Anteil eines
	Trainings angerechnet wird — 100% rechnet jede verbrannte Kalorie an, tiefere Werte sind vorsichtiger.
</p>
<p class="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
	<Badge variant="outline">iPhone</Badge>
	<Badge variant="outline">Android</Badge>
	Die mobilen Apps können Aktivitätskalorien automatisch aus Apple Health oder Health Connect übernehmen;
	im Web trägst du sie selbst in der Karte <strong>Tageseigenschaften</strong> eines Tages ein.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Erhaltungskalorien</h2>
<p class="mb-6">
	Die Seite <strong>Erhaltung</strong> schätzt anhand deiner tatsächlich erfassten Kalorienaufnahme und
	deines Gewichtstrends über einen Zeitraum, wie viele Kalorien du täglich verbrauchst — wähle eine Vorlage
	(2, 4, 8 oder 12 Wochen) oder einen eigenen Zeitraum. Mit dem Körperzusammensetzungs-Regler teilt sie
	deine Gewichtsänderung in Fett- und Muskelmasse auf (fettfreie Masse verändert sich langsamer, das beeinflusst
	die Schätzung) und zeigt die Aufschlüsselung neben dem Ergebnis.
</p>
<p class="mb-6">
	Die Schätzung wird zuverlässiger, je regelmässiger du im Zeitraum sowohl Lebensmittel erfasst als
	auch dich wiegst — bei zu geringer Abdeckung erscheint ein Hinweis, dass der Zahl nicht zu
	vertrauen ist. Sie ist dazu gedacht, alle paar Wochen mit neuen Daten neu berechnet zu werden,
	nicht einmal festgelegt und vergessen zu werden.
</p>
