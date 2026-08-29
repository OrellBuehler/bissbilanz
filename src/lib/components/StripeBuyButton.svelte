<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { DONATION_URL } from '$lib/seo';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	// A publishable key can only create payments — never read or move money — so
	// this is safe in client-side markup. It lives in the environment rather than
	// the repo so it can be rotated without a deploy, and so secret scanning
	// doesn't have to learn the difference between key prefixes.
	const buttonId = env.PUBLIC_STRIPE_BUY_BUTTON_ID;
	const publishableKey = env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
	const configured = Boolean(buttonId && publishableKey);

	// Loaded on mount rather than from <svelte:head> so Stripe's script only
	// reaches visitors who open a page that shows the button, and never runs
	// during SSR. Stripe defines the custom element once, however many buttons
	// end up on the page.
	const SRC = 'https://js.stripe.com/v3/buy-button.js';

	let ready = $state(false);

	onMount(() => {
		if (!configured) return;
		if (customElements.get('stripe-buy-button')) {
			ready = true;
			return;
		}
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
		if (existing) {
			existing.addEventListener('load', () => (ready = true), { once: true });
			return;
		}
		const script = document.createElement('script');
		script.src = SRC;
		script.async = true;
		script.addEventListener('load', () => (ready = true), { once: true });
		document.head.appendChild(script);
	});
</script>

{#if configured && ready}
	<stripe-buy-button buy-button-id={buttonId} publishable-key={publishableKey}></stripe-buy-button>
{:else if !configured}
	<!-- Unconfigured (local dev, or the env not set on a deploy): fall back to the
	     hosted payment link, which needs neither Stripe's script nor a key. -->
	<Button size="lg" href={DONATION_URL} target="_blank" rel="noopener">
		{m.landing_footer_donate()}
	</Button>
{/if}
