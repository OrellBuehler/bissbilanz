<script lang="ts">
	import { spring } from 'svelte/motion';
	import { usePan, type PanCustomEvent, type GestureCustomEvent } from 'svelte-gestures';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { Snippet } from 'svelte';

	type Props = {
		onDelete?: () => void;
		children: Snippet;
	};

	let { onDelete, children }: Props = $props();

	let offsetX = spring(0, { stiffness: 0.3, damping: 0.8 });
	let swiping = $state(false);
	const DELETE_THRESHOLD = -80;

	const panGesture = usePan(
		(e: PanCustomEvent) => {
			const x = e.detail.x;
			if (x > 0) {
				offsetX.set(0);
				return;
			}
			swiping = true;
			offsetX.set(Math.max(x, -100), { hard: true });
		},
		() => ({ delay: 0, touchAction: 'pan-y' as const }),
		{
			onpanup: (_e: GestureCustomEvent) => {
				if ($offsetX < DELETE_THRESHOLD && onDelete) {
					onDelete();
				}
				offsetX.set(0);
				swiping = false;
			}
		},
		true
	);

	function panAction(node: HTMLElement) {
		node.addEventListener('pan', panGesture.onpan as EventListener);
		if (panGesture.onpanup) {
			node.addEventListener('panup', panGesture.onpanup as EventListener);
		}
		const cleanup = panGesture.pan(node);
		return {
			destroy() {
				node.removeEventListener('pan', panGesture.onpan as EventListener);
				if (panGesture.onpanup) {
					node.removeEventListener('panup', panGesture.onpanup as EventListener);
				}
				cleanup();
			}
		};
	}
</script>

<div class="relative overflow-hidden rounded-lg">
	<div
		class="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-destructive text-destructive-foreground"
	>
		<Trash2 class="size-5" />
	</div>

	<div
		use:panAction
		style="transform: translateX({$offsetX}px)"
		class="relative bg-card"
		class:transition-transform={!swiping}
	>
		{@render children()}
	</div>
</div>
