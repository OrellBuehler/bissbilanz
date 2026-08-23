<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<Seo title={m.seo_privacy_title()} description={m.seo_privacy_description()} path="/privacy" />

<div class="mx-auto max-w-2xl px-6 py-12">
	<h1 class="mb-2 text-3xl font-bold">{m.privacy_page_title()}</h1>
	<p class="mb-8 text-sm text-muted-foreground">
		{m.privacy_effective_date({ date: 'August 19, 2026' })}
	</p>

	<p class="mb-6">
		Bissbilanz is a personal calorie and macro tracking app built by a solo hobbyist developer. This
		policy explains what data the app collects, how it is used, and how you can control it. It
		covers the web app at bissbilanz.orellbuehler.ch and the Bissbilanz apps for Android and iOS
		(including the widgets and the Apple Watch app).
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Who is responsible</h2>
	<p class="mb-6">
		The data controller is Orell Bühler, Switzerland. For any privacy question or request, contact
		<a href="mailto:me@orellbuehler.ch" class="underline">me@orellbuehler.ch</a>.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">What data is collected</h2>
	<p class="mb-3">When you use Bissbilanz with an account, the app stores the following:</p>
	<ul class="mb-6 list-disc space-y-1 pl-6">
		<li>
			<strong>Account information:</strong> Your name and email address, provided by your Infomaniak account
			when you log in.
		</li>
		<li>
			<strong>Food entries:</strong> What you ate, including calories, macronutrients (protein, carbs,
			fat, fiber) and optional extended nutrients, organized by meal and date.
		</li>
		<li>
			<strong>Custom foods, recipes and supplements:</strong> Any foods, recipes or supplements you create,
			including photos you attach to them.
		</li>
		<li><strong>Daily goals and preferences:</strong> Your targets and app settings.</li>
		<li><strong>Weight logs:</strong> Weight entries you record over time.</li>
		<li><strong>Sleep logs:</strong> Bedtime, wake time and sleep quality you record.</li>
		<li>
			<strong>Fasting:</strong> Whether you marked a day as a fasting day, and the start and end times
			of fasts you track.
		</li>
		<li>
			<strong>Meal photos for AI estimation:</strong> If you use the AI meal estimation feature, the photo
			you submit is stored with the pending task until the estimate is logged or dismissed.
		</li>
	</ul>
	<p class="mb-6">
		The app does not collect location data, advertising identifiers, or contact lists.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Camera</h2>
	<p class="mb-6">
		The mobile apps use the camera to scan barcodes and to read nutrition labels. Barcode and label
		recognition run on your device; camera frames are not uploaded. Only a scanned barcode number is
		sent to the server (and to Open Food Facts, see below) to look up the product. Photos you
		explicitly take for foods, recipes or AI meal estimation are uploaded to the server.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Local-only mode on mobile</h2>
	<p class="mb-6">
		The Android and iOS apps can be used without an account. In that mode all data stays in the
		app's local database on your device and nothing is sent to the server. If you later sign in,
		your local data is migrated to your account once.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Apple Health (iOS)</h2>
	<p class="mb-6">
		On iOS you can optionally connect Apple Health to import weight and sleep data into your log and
		to write your logged weight, sleep and nutrition back to Health. Health data is read and written
		only on your device with your permission; imported values become normal entries in your log.
		Bissbilanz never shares Health data with third parties and does not use it for advertising.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Health Connect (Android)</h2>
	<p class="mb-3">
		On Android you can optionally connect Health Connect. Bissbilanz only accesses it after you
		grant the individual permissions in the Health Connect permission dialog, and you can revoke
		them at any time in Health Connect or in Android settings. The app requests:
	</p>
	<ul class="mb-3 list-disc space-y-1 pl-6">
		<li>
			<strong>Weight (read and write):</strong> to import your weight into your log and to write weight
			you log in Bissbilanz back to Health Connect.
		</li>
		<li>
			<strong>Sleep (read and write):</strong> to import your sleep sessions into your log and to write
			sleep you log in Bissbilanz back to Health Connect.
		</li>
		<li>
			<strong>Nutrition (write only):</strong> to write the calories and macronutrients of the food you
			log back to Health Connect. Bissbilanz never reads nutrition data written by other apps.
		</li>
	</ul>
	<p class="mb-6">
		Health Connect data is used only to show you your own weight, sleep and nutrition inside the
		app. Values you import become normal entries in your log and are stored the same way as entries
		you type in yourself; they are deleted when you delete the entry or your account. Health Connect
		data is never sold, never used for advertising, never shared with third parties, and never sent
		to Sentry or any analytics service. If you revoke the permissions, the app stops reading and
		writing immediately; entries already imported stay in your log until you delete them.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">How your data is used</h2>
	<p class="mb-3">
		Your data is used solely to provide the food tracking functionality of the app: showing you what
		you ate, calculating your daily totals, charting trends, and tracking your progress against your
		goals.
	</p>
	<p class="mb-6">
		Your data is never sold, never used for advertising, and never shared with third parties except
		the services listed below.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">AI assistants (optional)</h2>
	<p class="mb-6">
		You can connect an AI assistant of your choice to your account via the Model Context Protocol
		(MCP). This only happens if you explicitly authorize it; the assistant then accesses your data
		with a token you can revoke at any time. What the assistant's provider does with data it reads
		is governed by that provider's own privacy policy.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Notifications</h2>
	<p class="mb-6">
		The mobile apps can show local notifications — for example an ongoing notification or Live
		Activity while a fast is running. These are generated on your device; no push service is used
		and no notification content leaves your phone.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">How your data is stored</h2>
	<p class="mb-6">
		All data is stored on a self-hosted PostgreSQL database located in Europe (Switzerland). The
		server is maintained by the developer. Data is transmitted over encrypted connections (HTTPS).
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Third-party services</h2>
	<p class="mb-3">Bissbilanz uses the following external services:</p>
	<ul class="mb-6 list-disc space-y-2 pl-6">
		<li>
			<strong>Infomaniak (authentication):</strong> When you log in, you authenticate through
			Infomaniak's OpenID Connect service. Infomaniak provides your name and email to the app.
			Infomaniak is a Swiss company subject to Swiss data protection law. Their privacy policy is
			available at
			<a href="https://www.infomaniak.com/en/legal/confidentiality" class="underline"
				>infomaniak.com</a
			>.
		</li>
		<li>
			<strong>Open Food Facts (product lookups):</strong> When you scan a barcode or search the Open
			Food Facts database, the barcode number or your search terms are sent to the Open Food Facts
			API. No personal data is sent. Open Food Facts is a nonprofit open data project. Their privacy
			policy is available at
			<a href="https://world.openfoodfacts.org/privacy" class="underline">world.openfoodfacts.org</a
			>.
		</li>
		<li>
			<strong>Sentry (crash reporting):</strong> The apps use Sentry to collect crash reports and
			error diagnostics. This may include device type, operating system version, and stack traces.
			No personal data such as food entries or account details is sent to Sentry. Their privacy
			policy is available at
			<a href="https://sentry.io/privacy/" class="underline">sentry.io</a>.
		</li>
	</ul>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Web analytics</h2>
	<p class="mb-6">
		The web app uses a self-hosted instance of
		<a href="https://umami.is" class="underline">Umami</a> to count page visits. Umami is a privacy-focused
		analytics tool: it sets no cookies, stores no personal identifiers, and does not track you across
		sites. The aggregate data (page views, browser type, country) stays on the developer's own server
		and is used only to understand how the app is used. The Android and iOS apps contain no analytics
		— crash reporting via Sentry is the only diagnostic data they send.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Data retention and deletion</h2>
	<p class="mb-6">
		Your data is kept for as long as you have an account. You can delete your account and all
		associated data at any time from the settings screen of the web app or the mobile apps. When you
		delete your account, all of your data — including uploaded photos — is permanently removed from
		the database. See
		<a href="/account-deletion" class="underline">how to delete your account</a> for step-by-step instructions
		and an email fallback if you can no longer sign in.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Your rights</h2>
	<p class="mb-6">
		Under the GDPR and the Swiss Data Protection Act you have the right to access, correct, export
		and delete your personal data. Everything you record is visible and editable in the app itself;
		for anything else, contact
		<a href="mailto:me@orellbuehler.ch" class="underline">me@orellbuehler.ch</a>.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Children's privacy</h2>
	<p class="mb-6">
		Bissbilanz is not directed at children under the age of 13 and does not knowingly collect data
		from children.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Changes to this policy</h2>
	<p class="mb-6">
		If this policy changes, the updated version will be posted here with a new effective date. Since
		this is a small hobby project, changes will be rare.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Contact</h2>
	<p class="mb-6">
		For privacy requests, questions or bug reports, email
		<a href="mailto:me@orellbuehler.ch" class="underline">me@orellbuehler.ch</a>. See the
		<a href="/support" class="underline">support page</a> for what to include and how long a reply takes.
	</p>
</div>
