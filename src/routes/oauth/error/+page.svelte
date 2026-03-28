<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { CircleAlert } from '@lucide/svelte';

	const errorCode = $derived($page.url.searchParams.get('code') ?? 'unknown');
	const detail = $derived($page.url.searchParams.get('detail'));

	const errorMessages: Record<string, string> = {
		missing_params: 'The authorization request is missing required parameters.',
		invalid_response_type: 'The requested response type is not supported.',
		invalid_code_challenge_method: 'The code challenge method is not supported.',
		invalid_code_challenge: 'The code challenge value is invalid.',
		invalid_client: 'The client application is not recognized.',
		unregistered_redirect_uri: 'The redirect URI is not registered for this client.',
		invalid_redirect_uri_format: 'The redirect URI format is invalid.',
		unknown: 'An unexpected error occurred during authorization.'
	};

	const message = $derived(errorMessages[errorCode] ?? errorMessages.unknown);
</script>

<div class="h-full overflow-y-auto bg-slate-50 flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2">
					<CircleAlert class="size-6 text-destructive flex-shrink-0" />
					<div>
						<Card.Title class="text-xl">Authorization Error</Card.Title>
						<Card.Description>Unable to complete the authorization request</Card.Description>
					</div>
				</div>
			</Card.Header>

			<Card.Content>
				<div class="space-y-4">
					<p class="text-sm text-slate-700">{message}</p>

					{#if detail}
						<div class="rounded-md bg-slate-100 px-3 py-2">
							<p class="text-xs font-mono text-slate-600 break-all">{detail}</p>
						</div>
					{/if}

					<p class="text-xs text-slate-500">
						Error code: <code class="font-mono">{errorCode}</code>
					</p>
				</div>
			</Card.Content>

			<div class="px-6 pb-6">
				<Button href="/" variant="outline" class="w-full">Go to Bissbilanz</Button>
			</div>
		</Card.Root>
	</div>
</div>
