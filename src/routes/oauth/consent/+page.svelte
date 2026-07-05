<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const permissions = [
		m.oauth_consent_permission_1,
		m.oauth_consent_permission_2,
		m.oauth_consent_permission_3,
		m.oauth_consent_permission_4
	];
</script>

<div class="h-full overflow-y-auto bg-slate-50 flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2">
					<div>
						<Card.Title class="text-xl">{m.oauth_consent_title()}</Card.Title>
						<Card.Description>{m.oauth_consent_desc()}</Card.Description>
					</div>
				</div>
			</Card.Header>

			<Card.Content>
				<div class="space-y-4">
					<div>
						<p class="text-sm text-slate-600 mb-3">
							<strong>{data.clientName ?? m.oauth_consent_default_app()}</strong>
							{m.oauth_consent_requesting_access()}
						</p>
						<ul class="space-y-2">
							{#each permissions as permission}
								<li class="flex items-start gap-2 text-sm">
									<Check class="size-5 text-green-600 flex-shrink-0 mt-0.5" />
									<span class="text-slate-700">{permission()}</span>
								</li>
							{/each}
						</ul>
					</div>

					<div class="pt-4 border-t">
						<p class="text-xs text-slate-500">
							{@html m.oauth_consent_footer()}
						</p>
					</div>
				</div>
			</Card.Content>

			<div class="flex gap-3 px-6 pb-6">
				<form method="POST" action="?/deny" class="flex-1">
					<input type="hidden" name="client_id" value={data.clientId} />
					<input type="hidden" name="redirect_uri" value={data.redirectUri} />
					<input type="hidden" name="state" value={data.state} />
					<Button type="submit" variant="outline" class="w-full">{m.oauth_consent_deny()}</Button>
				</form>

				<form method="POST" action="?/approve" class="flex-1">
					<input type="hidden" name="client_id" value={data.clientId} />
					<input type="hidden" name="redirect_uri" value={data.redirectUri} />
					<input type="hidden" name="state" value={data.state} />
					<input type="hidden" name="code_challenge" value={data.codeChallenge} />
					<input type="hidden" name="code_challenge_method" value={data.codeChallengeMethod} />
					<Button type="submit" class="w-full">{m.oauth_consent_approve()}</Button>
				</form>
			</div>
		</Card.Root>
	</div>
</div>
