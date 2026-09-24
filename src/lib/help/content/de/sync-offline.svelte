<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Offline arbeiten</h2>
<p class="mb-6">
	Bissbilanz ist eine PWA und hält eine lokale Kopie deiner Daten auf deinem Gerät, sodass Erfassen,
	das Durchsuchen deiner Lebensmittel und das Ansehen des letzten Verlaufs auch ohne Verbindung
	weiter funktionieren. Alles, was du offline tust, wird eingereiht und gesendet, sobald du wieder
	online bist — du musst es nicht erneut eingeben.
</p>
<p class="mb-6">
	Wurde derselbe Eintrag auf zwei Geräten geändert, während eines offline war, gewinnt die spätere
	Änderung, und ein Banner informiert dich, dass dies automatisch geschehen ist. Scheitert eine
	eingereihte Änderung tatsächlich (nicht nur wegen fehlender Verbindung), kannst du sie über
	dasselbe Banner erneut versuchen oder verwerfen.
</p>

<h2 class="mb-3 mt-8 flex items-center gap-2 text-xl font-semibold">
	Reiner Lokalmodus
	<Badge variant="outline">iPhone</Badge>
	<Badge variant="outline">Android</Badge>
</h2>
<p class="mb-6">
	Mit den mobilen Apps kannst du ohne Konto starten: Alles, was du erfasst, bleibt ausschliesslich
	auf diesem Gerät — nichts wird irgendwohin gesendet und nichts synchronisiert sich auf ein zweites
	Gerät. Die Web-App verlangt immer eine Anmeldung und kennt daher keinen entsprechenden Lokalmodus.
</p>
<p class="mb-6">
	Meldest du dich aus dem Lokalmodus jederzeit an, wird alles, was du erfasst hast, beim ersten
	Anmelden automatisch und einmalig in dein Konto übernommen — danach verhält sich das Gerät wie
	jedes andere angemeldete Gerät und synchronisiert normal.
</p>
