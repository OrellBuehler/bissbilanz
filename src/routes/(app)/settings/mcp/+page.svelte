<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let copiedField: 'clientId' | 'clientSecret' | 'serverUrl' | null = $state(null);
	let newRedirectUri = $state('');

	let activeClientSecret = $derived(form?.clientSecret || data.clientSecret);

	async function copyToClipboard(text: string, field: 'clientId' | 'clientSecret' | 'serverUrl') {
		try {
			await navigator.clipboard.writeText(text);
			copiedField = field;
			setTimeout(() => {
				copiedField = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	const setupInstructions = [
		m.mcp_setup_instruction_1,
		m.mcp_setup_instruction_2,
		m.mcp_setup_instruction_3,
		m.mcp_setup_instruction_4
	];

	const capabilities = [
		m.mcp_capability_1,
		m.mcp_capability_2,
		m.mcp_capability_3,
		m.mcp_capability_4,
		m.mcp_capability_5,
		m.mcp_capability_6,
		m.mcp_capability_7,
		m.mcp_capability_8
	];
</script>

<svelte:head>
	<title>{m.mcp_page_title()}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p class="text-muted-foreground mt-1">
			{m.mcp_page_description()}
		</p>
	</div>

	<!-- OAuth Credentials Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.mcp_credentials_title()}</Card.Title>
			<Card.Description>
				{m.mcp_credentials_desc()}
			</Card.Description>
		</Card.Header>

		<Card.Content class="space-y-4">
			<!-- Server URL -->
			<div class="space-y-2">
				<Label for="serverUrl">{m.mcp_server_url_label()}</Label>
				<div class="flex gap-2">
					<Input
						id="serverUrl"
						type="text"
						readonly
						value={data.serverUrl}
						class="font-mono text-sm flex-1"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={() => data.serverUrl && copyToClipboard(data.serverUrl, 'serverUrl')}
					>
						{copiedField === 'serverUrl' ? m.mcp_copied() : m.mcp_copy()}
					</Button>
				</div>
			</div>

			<!-- Client ID -->
			<div class="space-y-2">
				<Label for="clientId">{m.mcp_client_id_label()}</Label>
				<div class="flex gap-2">
					<Input
						id="clientId"
						type="text"
						readonly
						value={data.clientId}
						class="font-mono text-sm flex-1"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={() => data.clientId && copyToClipboard(data.clientId, 'clientId')}
					>
						{copiedField === 'clientId' ? m.mcp_copied() : m.mcp_copy()}
					</Button>
				</div>
			</div>

			<!-- Client Secret -->
			<div class="space-y-2">
				<Label for="clientSecret">{m.mcp_client_secret_label()}</Label>
				{#if activeClientSecret}
					<div class="flex gap-2">
						<Input
							id="clientSecret"
							type="text"
							readonly
							value={activeClientSecret}
							class="font-mono text-sm flex-1"
						/>
						<Button
							variant="outline"
							size="sm"
							onclick={() => copyToClipboard(activeClientSecret, 'clientSecret')}
						>
							{copiedField === 'clientSecret' ? m.mcp_copied() : m.mcp_copy()}
						</Button>
					</div>
					<p class="text-sm text-amber-600 flex items-start gap-2">
						<TriangleAlert class="size-5 flex-shrink-0 mt-0.5" />
						<span>{m.mcp_client_secret_warning()}</span>
					</p>
				{:else}
					<div class="rounded-md bg-muted border p-4">
						<p class="text-sm text-muted-foreground">
							{m.mcp_client_secret_hidden()}
						</p>
					</div>
				{/if}
			</div>

			<!-- Regenerate Secret -->
			<div class="pt-4 border-t">
				<div class="space-y-3">
					<div>
						<h4 class="font-medium">{m.mcp_regenerate_title()}</h4>
						<p class="text-sm text-muted-foreground mt-1">
							{m.mcp_regenerate_desc()}
						</p>
					</div>
					<form method="POST" action="?/regenerate" use:enhance>
						<Button type="submit" variant="outline" class="w-full md:w-auto">
							{m.mcp_regenerate_button()}
						</Button>
					</form>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Allowed Redirect URIs Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.mcp_redirect_uris_title()}</Card.Title>
			<Card.Description>
				{m.mcp_redirect_uris_desc()}
			</Card.Description>
		</Card.Header>

		<Card.Content class="space-y-4">
			<form method="POST" action="?/addRedirectUri" use:enhance class="flex gap-2">
				<Input
					type="url"
					name="redirectUri"
					placeholder={m.mcp_redirect_uri_placeholder()}
					bind:value={newRedirectUri}
					class="flex-1"
				/>
				<Button type="submit" variant="outline" disabled={!newRedirectUri}>{m.mcp_add()}</Button>
			</form>

			{#if data.allowedRedirectUris && data.allowedRedirectUris.length > 0}
				<div class="space-y-2">
					<Label>{m.mcp_redirect_uris_registered_label()}</Label>
					<ul class="space-y-2">
						{#each data.allowedRedirectUris as uri}
							<li class="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
								<code class="text-sm font-mono truncate flex-1">{uri}</code>
								<form method="POST" action="?/removeRedirectUri" use:enhance class="ml-2">
									<input type="hidden" name="redirectUri" value={uri} />
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										class="text-red-600 hover:text-red-700 hover:bg-red-50"
									>
										{m.mcp_remove()}
									</Button>
								</form>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<div class="rounded-md bg-amber-50 border border-amber-200 p-4">
					<p class="text-sm text-amber-700">
						{m.mcp_redirect_uris_empty()}
					</p>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Connected Applications Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.mcp_connected_apps()}</Card.Title>
			<Card.Description>{m.mcp_connected_apps_desc()}</Card.Description>
		</Card.Header>

		<Card.Content>
			{#if data.authorizedClients && data.authorizedClients.length > 0}
				<ul class="space-y-2">
					{#each data.authorizedClients as client}
						<li class="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium truncate">
									{client.clientName ?? m.mcp_client_name_fallback()}
								</p>
								{#if client.approvedAt}
									<p class="text-xs text-muted-foreground">
										{m.mcp_approved_at({
											date: new Date(client.approvedAt).toLocaleDateString()
										})}
									</p>
								{/if}
							</div>
							<form
								method="POST"
								action="?/revokeClient"
								use:enhance
								class="ml-2"
								onsubmit={(e) => {
									if (!confirm(m.mcp_revoke_confirm())) e.preventDefault();
								}}
							>
								<input type="hidden" name="clientId" value={client.clientId} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									class="text-red-600 hover:text-red-700 hover:bg-red-50"
								>
									{m.mcp_revoke()}
								</Button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{m.mcp_no_connected_apps()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Setup Instructions Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.mcp_setup_title()}</Card.Title>
			<Card.Description>{m.mcp_setup_desc()}</Card.Description>
		</Card.Header>

		<Card.Content>
			<div class="space-y-4">
				<div>
					<h4 class="font-medium mb-3">{m.mcp_setup_step1_title()}</h4>
					<ol class="space-y-2 list-decimal list-inside">
						{#each setupInstructions as instruction}
							<li class="text-sm text-muted-foreground">{instruction()}</li>
						{/each}
					</ol>
				</div>

				<div class="pt-4 border-t">
					<h4 class="font-medium mb-3">{m.mcp_setup_step2_title()}</h4>
					<p class="text-sm text-muted-foreground">
						{m.mcp_setup_step2_desc()}
					</p>
				</div>

				<div class="pt-4 border-t">
					<h4 class="font-medium mb-3">{m.mcp_setup_capabilities_title()}</h4>
					<ul class="space-y-2">
						{#each capabilities as capability}
							<li class="flex items-start gap-2 text-sm">
								<Check class="size-5 text-green-600 flex-shrink-0 mt-0.5" />
								<span class="text-muted-foreground">{capability()}</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
