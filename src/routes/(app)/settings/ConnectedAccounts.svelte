<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import ProviderIcon from '$lib/components/auth/ProviderIcon.svelte';
	import Unlink from '@lucide/svelte/icons/unlink';
	import Plus from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	type Identity = {
		id: string;
		provider: string;
		email: string | null;
		createdAt: string | null;
	};

	let identities = $state<Identity[]>([]);
	let available = $state<string[]>([]);
	let loading = $state(true);

	const providerLabels: Record<string, () => string> = {
		infomaniak: m.provider_infomaniak,
		google: m.provider_google,
		microsoft: m.provider_microsoft,
		apple: m.provider_apple
	};

	const label = (provider: string) => providerLabels[provider]?.() ?? provider;

	const unlinked = $derived(available.filter((p) => !identities.some((i) => i.provider === p)));
	const isLastIdentity = $derived(identities.length <= 1);

	async function load() {
		try {
			const response = await fetch('/api/auth/identities');
			if (!response.ok) return;
			const data = await response.json();
			identities = data.identities;
			available = data.available;
		} finally {
			loading = false;
		}
	}

	async function disconnect(identity: Identity) {
		const response = await fetch(`/api/auth/identities/${identity.id}`, { method: 'DELETE' });
		if (!response.ok) {
			toast.error(
				response.status === 409 ? m.connected_accounts_last_error() : m.connected_accounts_error()
			);
			return;
		}
		identities = identities.filter((i) => i.id !== identity.id);
		toast.success(m.connected_accounts_disconnected({ provider: label(identity.provider) }));
	}

	onMount(() => {
		// The link flow returns here from the provider with its outcome in the URL.
		const linked = page.url.searchParams.get('linked');
		const linkError = page.url.searchParams.get('link_error');
		if (linked) toast.success(m.connected_accounts_connected({ provider: label(linked) }));
		if (linkError) toast.error(m.connected_accounts_conflict());
		// Drop the outcome params so a reload does not re-toast.
		if (linked || linkError) {
			goto(page.url.pathname, { replaceState: true, noScroll: true });
		}

		load();
	});
</script>

{#if !loading}
	<ul class="divide-border divide-y">
		{#each identities as identity (identity.id)}
			<li class="flex items-center justify-between gap-3 py-3">
				<div class="flex min-w-0 items-center gap-3">
					<ProviderIcon provider={identity.provider} />
					<div class="min-w-0">
						<p class="truncate text-sm font-medium">{label(identity.provider)}</p>
						{#if identity.email}
							<p class="text-muted-foreground truncate text-xs">{identity.email}</p>
						{/if}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					disabled={isLastIdentity}
					title={isLastIdentity ? m.connected_accounts_last_error() : undefined}
					onclick={() => disconnect(identity)}
				>
					<Unlink class="size-4" />
				</Button>
			</li>
		{/each}
	</ul>

	{#if unlinked.length > 0}
		<div class="mt-4 flex flex-col gap-2">
			{#each unlinked as provider (provider)}
				<Button
					variant="outline"
					class="w-full justify-start gap-3"
					href={`/api/auth/login?provider=${provider}&link=1`}
				>
					<Plus class="size-4" />
					<ProviderIcon {provider} class="size-4" />
					<span>{m.connected_accounts_connect({ provider: label(provider) })}</span>
				</Button>
			{/each}
		</div>
	{/if}
{/if}
