<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	type Status = 'loading' | 'unavailable' | 'unsupported' | 'blocked' | 'ready';

	let status = $state<Status>('loading');
	let publicKey = $state<string | null>(null);
	let subscribed = $state(false);
	let busy = $state(false);
	let testing = $state(false);
	let iosNeedsInstall = $state(false);

	const supportsPush = () =>
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window;

	const isIosSafari = () =>
		typeof navigator !== 'undefined' &&
		/iP(hone|ad|od)/.test(navigator.userAgent) &&
		!window.matchMedia('(display-mode: standalone)').matches;

	/** VAPID keys travel as base64url; PushManager wants raw bytes. */
	const decodeKey = (base64: string) => {
		const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
			.replace(/-/g, '+')
			.replace(/_/g, '/');
		const raw = atob(padded);
		return Uint8Array.from(raw, (char) => char.charCodeAt(0));
	};

	const currentSubscription = async () => {
		const registration = await navigator.serviceWorker.ready;
		return registration.pushManager.getSubscription();
	};

	onMount(async () => {
		try {
			const res = await fetch('/api/push/vapid-public-key');
			const data = res.ok ? await res.json() : { enabled: false };
			if (!data.enabled) {
				status = 'unavailable';
				return;
			}
			publicKey = data.publicKey;
		} catch {
			status = 'unavailable';
			return;
		}

		if (!supportsPush()) {
			iosNeedsInstall = isIosSafari();
			status = 'unsupported';
			return;
		}

		subscribed = (await currentSubscription()) !== null;
		status = Notification.permission === 'denied' ? 'blocked' : 'ready';
	});

	const enable = async () => {
		if (!publicKey) return;
		busy = true;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				status = permission === 'denied' ? 'blocked' : 'ready';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription =
				(await registration.pushManager.getSubscription()) ??
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: decodeKey(publicKey)
				}));
			const res = await fetch('/api/push/subscriptions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(subscription.toJSON())
			});
			if (!res.ok) throw new Error('subscribe failed');
			subscribed = true;
			status = 'ready';
		} catch {
			toast.error(m.settings_notifications_failed());
		} finally {
			busy = false;
		}
	};

	const disable = async () => {
		busy = true;
		try {
			const subscription = await currentSubscription();
			if (subscription) {
				await fetch('/api/push/subscriptions', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: subscription.endpoint })
				});
				await subscription.unsubscribe();
			}
			subscribed = false;
		} catch {
			toast.error(m.settings_notifications_failed());
		} finally {
			busy = false;
		}
	};

	const toggle = (next: boolean) => (next ? enable() : disable());

	const sendTest = async () => {
		testing = true;
		try {
			const res = await fetch('/api/push/test', { method: 'POST' });
			if (!res.ok) throw new Error('test failed');
			toast.success(m.settings_notifications_test_sent());
		} catch {
			toast.error(m.settings_notifications_test_failed());
		} finally {
			testing = false;
		}
	};
</script>

{#if status !== 'loading' && status !== 'unavailable'}
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<BellRing class="size-4" />
				{m.settings_notifications()}
			</Card.Title>
			<Card.Description>{m.settings_notifications_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if status === 'unsupported'}
				<p class="text-muted-foreground text-sm">{m.settings_notifications_unsupported()}</p>
				{#if iosNeedsInstall}
					<p class="text-muted-foreground text-sm">{m.settings_notifications_ios_hint()}</p>
				{/if}
			{:else}
				<div class="flex items-center justify-between gap-4">
					<Label for="push-toggle" class="text-sm font-medium">
						{m.settings_notifications_toggle()}
					</Label>
					<Switch
						id="push-toggle"
						checked={subscribed}
						disabled={busy || status === 'blocked'}
						onCheckedChange={toggle}
					/>
				</div>
				{#if status === 'blocked'}
					<p class="text-muted-foreground text-sm">{m.settings_notifications_blocked()}</p>
				{:else}
					<p class="text-muted-foreground text-sm">
						{subscribed ? m.settings_notifications_on() : m.settings_notifications_off()}
					</p>
				{/if}
				{#if subscribed}
					<Button variant="outline" size="sm" disabled={testing} onclick={sendTest}>
						{m.settings_notifications_test()}
					</Button>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
