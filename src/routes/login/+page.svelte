<script lang="ts">
	import { login } from '$lib/stores/auth.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';
</script>

<div class="bg-surface-container-low flex min-h-screen w-full items-center justify-center px-4">
	<Card.Root class="mx-auto w-full max-w-md">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl">{m.app_title()}</Card.Title>
			<Card.Description>{m.app_tagline()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button class="w-full" size="lg" onclick={login}>
				{m.auth_login()}
			</Button>
		</Card.Content>
		<Card.Footer class="justify-center">
			<p class="text-muted-foreground text-xs">Powered by Infomaniak OIDC</p>
		</Card.Footer>
	</Card.Root>
</div>
