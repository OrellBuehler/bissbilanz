<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<h2 class="mb-3 mt-8 text-xl font-semibold">Working offline</h2>
<p class="mb-6">
	Bissbilanz is a PWA and keeps a local copy of your data on your device, so logging, browsing your
	foods and reviewing recent history all keep working without a connection. Anything you do offline
	is queued and sent the moment you're back online — you don't need to redo it.
</p>
<p class="mb-6">
	If the same entry was changed on two devices while one was offline, the later edit wins and a
	banner tells you it happened automatically. If a queued change genuinely fails to sync (not just
	offline), you can retry it or discard it from the same banner.
</p>

<h2 class="mb-3 mt-8 flex items-center gap-2 text-xl font-semibold">
	Local-only mode
	<Badge variant="outline">iPhone</Badge>
	<Badge variant="outline">Android</Badge>
</h2>
<p class="mb-6">
	The mobile apps let you start without an account: everything you log stays on that device only —
	nothing is sent anywhere, and nothing syncs to a second device. The web app always requires
	signing in, so it has no equivalent local-only mode.
</p>
<p class="mb-6">
	Sign in from local-only mode at any time and everything you've logged migrates to your account
	automatically, once, the first time you sign in — after that the device behaves like any other
	signed-in device and syncs normally.
</p>
