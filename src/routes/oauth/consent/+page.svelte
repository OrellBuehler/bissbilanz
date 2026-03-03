<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const permissions = [
		'View your food database and recipes',
		'Log food entries to your daily diary',
		'Create new foods and recipes',
		'View your nutrition goals and progress'
	];
</script>

<div class="h-full overflow-y-auto bg-slate-50 flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2">
					<div>
						<Card.Title class="text-xl">Authorize MCP Access</Card.Title>
						<Card.Description>Grant access to your Bissbilanz data</Card.Description>
					</div>
				</div>
			</Card.Header>

			<Card.Content>
				<div class="space-y-4">
					<div>
						<p class="text-sm text-slate-600 mb-3">
							<strong>{data.clientName ?? 'An application'}</strong> is requesting access to your account
							with the following permissions:
						</p>
						<ul class="space-y-2">
							{#each permissions as permission}
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
									<span class="text-slate-700">{permission}</span>
								</li>
							{/each}
						</ul>
					</div>

					<div class="pt-4 border-t">
						<p class="text-xs text-slate-500">
							By approving, you allow this application to access your Bissbilanz data on your
							behalf. You can revoke access at any time from your
							<a href="/settings/mcp" class="underline hover:text-slate-700">MCP settings</a>.
						</p>
					</div>
				</div>
			</Card.Content>

			<div class="flex gap-3 px-6 pb-6">
				<form method="POST" action="?/deny" class="flex-1">
					<input type="hidden" name="client_id" value={data.clientId} />
					<input type="hidden" name="redirect_uri" value={data.redirectUri} />
					<input type="hidden" name="state" value={data.state} />
					<Button type="submit" variant="outline" class="w-full">Deny</Button>
				</form>

				<form method="POST" action="?/approve" class="flex-1">
					<input type="hidden" name="client_id" value={data.clientId} />
					<input type="hidden" name="redirect_uri" value={data.redirectUri} />
					<input type="hidden" name="state" value={data.state} />
					<input type="hidden" name="code_challenge" value={data.codeChallenge} />
					<input type="hidden" name="code_challenge_method" value={data.codeChallengeMethod} />
					<Button type="submit" class="w-full">Approve</Button>
				</form>
			</div>
		</Card.Root>
	</div>
</div>
