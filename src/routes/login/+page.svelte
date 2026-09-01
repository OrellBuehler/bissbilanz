<script lang="ts">
	import { login } from '$lib/stores/auth.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import ProviderIcon from '$lib/components/auth/ProviderIcon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const providerLabels: Record<string, () => string> = {
		infomaniak: m.auth_login_infomaniak,
		google: m.auth_login_google,
		apple: m.auth_login_apple
	};
</script>

<Seo title={m.seo_login_title()} description={m.seo_login_description()} path="/login" noindex />

<div class="bg-surface-container-low flex min-h-screen w-full items-center justify-center px-4">
	<Card.Root class="mx-auto w-full max-w-md">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl">{m.app_title()}</Card.Title>
			<Card.Description>{m.app_tagline()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#each data.providers as provider (provider)}
				<Button
					variant="outline"
					class="w-full justify-start gap-3"
					size="lg"
					onclick={() => login(provider)}
				>
					<ProviderIcon {provider} />
					<span>{providerLabels[provider]?.() ?? provider}</span>
				</Button>
			{/each}
		</Card.Content>
		<Card.Footer class="justify-center">
			<p class="text-muted-foreground text-center text-xs">{m.login_account_hint()}</p>
		</Card.Footer>
	</Card.Root>
</div>
