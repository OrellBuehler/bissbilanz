<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { CircleAlert } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	const errorCode = $derived($page.url.searchParams.get('code') ?? 'unknown');
	const detail = $derived($page.url.searchParams.get('detail'));

	const errorMessages: Record<string, () => string> = {
		missing_params: m.oauth_error_missing_params,
		invalid_response_type: m.oauth_error_invalid_response_type,
		invalid_code_challenge_method: m.oauth_error_invalid_code_challenge_method,
		invalid_code_challenge: m.oauth_error_invalid_code_challenge,
		invalid_client: m.oauth_error_invalid_client,
		unregistered_redirect_uri: m.oauth_error_unregistered_redirect_uri,
		invalid_redirect_uri_format: m.oauth_error_invalid_redirect_uri_format,
		unknown: m.oauth_error_unknown
	};

	const message = $derived((errorMessages[errorCode] ?? errorMessages.unknown)());
</script>

<div class="h-full overflow-y-auto bg-background flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2">
					<CircleAlert class="size-6 text-destructive flex-shrink-0" />
					<div>
						<Card.Title class="text-xl">{m.oauth_error_title()}</Card.Title>
						<Card.Description>{m.oauth_error_description()}</Card.Description>
					</div>
				</div>
			</Card.Header>

			<Card.Content>
				<div class="space-y-4">
					<p class="text-sm text-foreground">{message}</p>

					{#if detail}
						<div class="rounded-md bg-muted px-3 py-2">
							<p class="text-xs font-mono text-muted-foreground break-all">{detail}</p>
						</div>
					{/if}

					<p class="text-xs text-muted-foreground">
						{m.oauth_error_code_label()} <code class="font-mono">{errorCode}</code>
					</p>
				</div>
			</Card.Content>

			<div class="px-6 pb-6">
				<Button href="/home" variant="outline" class="w-full">{m.oauth_error_go_home()}</Button>
			</div>
		</Card.Root>
	</div>
</div>
