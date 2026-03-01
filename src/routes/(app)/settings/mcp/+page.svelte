<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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
		'Go to claude.ai and open Settings',
		'Navigate to the "Developer" or "MCP" section',
		'Add a new MCP server with the credentials above',
		'Use the server URL, client ID, and client secret shown below'
	];
</script>

<svelte:head>
	<title>MCP Settings - Bissbilanz</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p class="text-muted-foreground mt-1">
			Configure Model Context Protocol access for Claude and other AI assistants
		</p>
	</div>

	<!-- OAuth Credentials Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>OAuth Credentials</Card.Title>
			<Card.Description>
				Use these credentials to connect Claude or other MCP clients to your account
			</Card.Description>
		</Card.Header>

		<Card.Content class="space-y-4">
			<!-- Server URL -->
			<div class="space-y-2">
				<Label for="serverUrl">Server URL</Label>
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
						{copiedField === 'serverUrl' ? 'Copied!' : 'Copy'}
					</Button>
				</div>
			</div>

			<!-- Client ID -->
			<div class="space-y-2">
				<Label for="clientId">Client ID</Label>
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
						{copiedField === 'clientId' ? 'Copied!' : 'Copy'}
					</Button>
				</div>
			</div>

			<!-- Client Secret -->
			<div class="space-y-2">
				<Label for="clientSecret">Client Secret</Label>
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
							{copiedField === 'clientSecret' ? 'Copied!' : 'Copy'}
						</Button>
					</div>
					<p class="text-sm text-amber-600 flex items-start gap-2">
						<svg
							class="size-5 flex-shrink-0 mt-0.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span> Save this secret now. For security reasons, it will not be shown again. </span>
					</p>
				{:else}
					<div class="rounded-md bg-muted border p-4">
						<p class="text-sm text-muted-foreground">
							Your client secret is hidden for security. If you need to view it again, regenerate a
							new secret below.
						</p>
					</div>
				{/if}
			</div>

			<!-- Regenerate Secret -->
			<div class="pt-4 border-t">
				<div class="space-y-3">
					<div>
						<h4 class="font-medium">Regenerate Secret</h4>
						<p class="text-sm text-muted-foreground mt-1">
							Generate a new client secret and invalidate all existing access tokens. This will
							disconnect all currently connected MCP clients.
						</p>
					</div>
					<form method="POST" action="?/regenerate" use:enhance>
						<Button type="submit" variant="outline" class="w-full md:w-auto">
							Regenerate Client Secret
						</Button>
					</form>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Allowed Redirect URIs Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Allowed Redirect URIs</Card.Title>
			<Card.Description>
				Register the callback URLs that your MCP clients use. The OAuth authorization flow will only
				redirect to these URIs.
			</Card.Description>
		</Card.Header>

		<Card.Content class="space-y-4">
			<form method="POST" action="?/addRedirectUri" use:enhance class="flex gap-2">
				<Input
					type="url"
					name="redirectUri"
					placeholder="https://your-app.com/callback"
					bind:value={newRedirectUri}
					class="flex-1"
				/>
				<Button type="submit" variant="outline" disabled={!newRedirectUri}>Add</Button>
			</form>

			{#if data.allowedRedirectUris && data.allowedRedirectUris.length > 0}
				<div class="space-y-2">
					<Label>Registered URIs</Label>
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
										Remove
									</Button>
								</form>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<div class="rounded-md bg-amber-50 border border-amber-200 p-4">
					<p class="text-sm text-amber-700">
						No redirect URIs registered. You must add at least one redirect URI before using OAuth.
						For Claude.ai, add your callback URL (e.g., https://claude.ai/oauth/callback).
					</p>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Setup Instructions Card -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Setup Instructions</Card.Title>
			<Card.Description
				>How to connect Claude or other AI assistants to your Bissbilanz account</Card.Description
			>
		</Card.Header>

		<Card.Content>
			<div class="space-y-4">
				<div>
					<h4 class="font-medium mb-3">Step 1: Configure MCP Client</h4>
					<ol class="space-y-2 list-decimal list-inside">
						{#each setupInstructions as instruction}
							<li class="text-sm text-muted-foreground">{instruction}</li>
						{/each}
					</ol>
				</div>

				<div class="pt-4 border-t">
					<h4 class="font-medium mb-3">Step 2: Authorize Access</h4>
					<p class="text-sm text-muted-foreground">
						When you first use the MCP connection, you'll be prompted to authorize access in your
						browser. This allows the MCP client to access your Bissbilanz data securely.
					</p>
				</div>

				<div class="pt-4 border-t">
					<h4 class="font-medium mb-3">Available Capabilities</h4>
					<ul class="space-y-2">
						{#each ["View today's nutrition status and goals", 'Search your food database and scan barcodes', 'Create, update and delete foods and recipes', 'Log food entries and copy meals between days', 'Track supplements and daily supplement status', 'Log and review body weight over time', 'View weekly/monthly stats, streaks and top foods', 'Manage entries, favorites and macro goals'] as capability}
							<li class="flex items-start gap-2 text-sm">
								<svg
									class="size-5 text-green-600 flex-shrink-0 mt-0.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
								<span class="text-muted-foreground">{capability}</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
