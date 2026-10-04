<h2 class="mb-3 mt-8 text-xl font-semibold">Einen Assistenten verbinden</h2>
<p class="mb-6">
	Bissbilanz stellt dein Tagebuch als MCP-Server bereit, sodass ein KI-Assistent deine Daten in
	normaler Sprache erfassen und einsehen kann — Lebensmittel suchen oder anlegen, Einträge erfassen,
	deinen Fortschritt prüfen, Gewicht oder Supplemente erfassen und mehr. Öffne
	<strong>Einstellungen → Assistent verbinden</strong> in der App (im Web
	<strong>Einstellungen → MCP</strong>), um einen zu verbinden.
</p>
<p class="mb-3">Je nach verwendetem Assistenten:</p>
<ul class="mb-6 list-disc space-y-1 pl-6">
	<li>
		<strong>Claude</strong> (Web, Desktop oder Mobile) — tippe auf
		<strong>Mit Claude verbinden</strong>. Claude öffnet sich mit bereits ausgefülltem
		Bissbilanz-Connector; bestätige ihn und erlaube danach den Zugriff auf der Bissbilanz-Seite.
		Einmal hinzugefügt, funktioniert er auch in den Claude-Apps auf dem Handy.
	</li>
	<li>
		<strong>ChatGPT</strong> — vorerst nur im Web, noch nicht in der ChatGPT-App auf dem Handy, und mit
		einem Plus- oder Pro-Plan. Öffne auf chatgpt.com Einstellungen → Sicherheit und Anmeldung und schalte
		den Entwicklermodus ein, gehe zu chatgpt.com/plugins, klicke auf „+“, füge die Server-URL ein, wähle
		CIMD als OAuth-Methode und erstelle den Eintrag. Erlaube den Zugriff auf der Bissbilanz-Seite und
		aktiviere Bissbilanz dann über das „+“-Menü im Nachrichtenfeld.
	</li>
	<li>
		<strong>Gemini</strong> — in der Schweiz noch nicht verfügbar.
	</li>
	<li>
		<strong>Claude Code</strong> — kopiere den auf der Verbindungsseite angezeigten Befehl, führe
		ihn aus und melde dich anschliessend mit <code>/mcp</code> an.
	</li>
	<li>
		<strong>Andere MCP-Clients</strong> — die meisten unterstützen das direkte Einfügen der
		Server-URL. Ein Client, der sie so nicht erkennt, kann die vorregistrierte Client-ID und das
		Secret unter <strong>Erweitert</strong> auf der Web-Einstellungsseite verwenden.
	</li>
</ul>
<p class="mb-6">
	Du bestätigst jeden Assistenten einmal auf einem Zustimmungsbildschirm, der ihn und seine Herkunft
	nennt. Entziehe den Zugriff jederzeit unter <strong
		>Einstellungen → MCP → Verbundene Anwendungen</strong
	> — das entzieht sofort jedes Token, das der Assistent besitzt.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">Was er kann</h2>
<p class="mb-6">
	Ein verbundener Assistent kann dein Tagebuch, Lebensmittel, Rezepte, Ziele, Gewicht, Schlaf,
	Supplemente und Statistiken lesen und schreiben — überall gelten dieselben Konventionen (Datum in
	deiner Zeitzone, grossgeschriebene Mahlzeitentypen, Suche vor dem Anlegen eines Lebensmittels). Es
	ist ein normales Gespräch: "Ich hatte zwei Eier und Toast zum Frühstück" genügt, damit er die
	Lebensmittel findet oder anlegt und den Eintrag erfasst.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">KI-Aufgaben — Erfassen per Foto</h2>
<p class="mb-6">
	Lieber ein Foto machen statt zu tippen? Öffne <strong>KI-Aufgaben</strong> und mache bis zu fünf Fotos
	und/oder eine Beschreibung, mit optionaler Mahlzeit und Uhrzeit — sie wird eingereiht statt sofort erfasst.
	Meldet sich dein verbundener Assistent das nächste Mal, prüft er die Warteschlange und erfasst den Eintrag
	für dich (oder du beschreibst und erfasst ihn selbst im gleichen Gespräch).
</p>
