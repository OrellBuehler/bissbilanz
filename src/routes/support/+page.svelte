<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<Seo title={m.seo_support_title()} description={m.seo_support_description()} path="/support" />

<div class="mx-auto max-w-2xl px-6 py-12">
	<h1 class="mb-8 text-3xl font-bold">Bissbilanz support</h1>

	<p class="mb-6">
		Bissbilanz is built by a solo hobbyist developer. There is no support hotline — but every report
		is read and answered personally, usually within a few days.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Get in touch</h2>
	<p class="mb-3">
		Bug reports and feature requests are best filed on GitHub. The forms ask for everything needed
		to act on them, and you can follow what happens to your report afterwards:
	</p>
	<ul class="mb-6 list-disc space-y-2 pl-6">
		<li>
			<a
				href="https://github.com/OrellBuehler/bissbilanz/issues/new?template=bug_report.yml"
				class="underline">Report a bug</a
			> — something is broken or behaves unexpectedly.
		</li>
		<li>
			<a
				href="https://github.com/OrellBuehler/bissbilanz/issues/new?template=feature_request.yml"
				class="underline">Request a feature</a
			> — something is missing or could work better.
		</li>
	</ul>
	<p class="mb-3">
		The forms ask for the app you used, its version (shown at the bottom of the Settings screen),
		your device and OS version, what you did, what you expected, what happened instead, and a
		screenshot if the problem is visible. Issues are public, so please leave credentials and
		personal details out of them.
	</p>
	<p class="mb-6">
		Opening an issue needs a GitHub account. Without one — or for anything about your own account,
		your data or a privacy request, which does not belong in a public issue — email
		<a href="mailto:me@orellbuehler.ch" class="underline">me@orellbuehler.ch</a> in English or German.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Common questions</h2>
	<h3 class="mb-2 mt-6 font-semibold">Why is there no big built-in food database?</h3>
	<p class="mb-3">
		That is on purpose. Bissbilanz does not ship a catalogue of millions of half-correct entries —
		you build your own food database instead. Every food you add once is yours, with your serving
		sizes and the values from the packaging you actually bought, and it is a tap away from then on.
		Barcode scanning, label scanning and the Open Food Facts lookup are there to fill in that first
		entry for you, not to replace it.
	</p>
	<p class="mb-6">
		The quickest way to build it up is an AI assistant connected over MCP (Settings → MCP in the web
		app): describe what you ate in plain language and the assistant creates the foods and recipes
		and logs the entries for you. After a couple of weeks of normal use, most of what you eat
		regularly is already in your own list — and it is more accurate than a generic database, because
		the values are the ones you entered.
	</p>

	<h3 class="mb-2 mt-6 font-semibold">A food I scanned has wrong nutrition values</h3>
	<p class="mb-6">
		Barcode lookups come from the open Open Food Facts database. You can correct the values when you
		log the food, or edit the food afterwards — your copy is stored in your own food database and is
		used for future entries.
	</p>

	<h3 class="mb-2 mt-6 font-semibold">My entries are missing on another device</h3>
	<p class="mb-6">
		Entries sync once the app is online and you are signed in. If you used the mobile app without an
		account, the data lives only on that device until you sign in — it is migrated to your account
		on first sign-in. Pull to refresh to force a sync.
	</p>

	<h3 class="mb-2 mt-6 font-semibold">How do I connect Apple Health or Health Connect?</h3>
	<p class="mb-6">
		Open Settings in the mobile app and enable the health integration there. You grant each
		permission individually and can revoke them at any time in Apple Health or Health Connect.
	</p>

	<h3 class="mb-2 mt-6 font-semibold">How do I delete my account?</h3>
	<p class="mb-6">
		See <a href="/account-deletion" class="underline">how to delete your account</a>. Deletion is
		immediate and removes all of your data.
	</p>

	<h2 class="mb-3 mt-8 text-xl font-semibold">Privacy</h2>
	<p class="mb-6">
		What Bissbilanz stores and why is described in the
		<a href="/privacy" class="underline">privacy policy</a>.
	</p>
</div>
