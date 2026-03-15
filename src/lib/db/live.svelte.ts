import { liveQuery, type Observable } from 'dexie';
import { browser } from '$app/environment';

type LiveQueryResult<T> = {
	readonly value: T;
	readonly loading: boolean;
};

export function useLiveQuery<T>(
	querier: () => T | Promise<T>,
	initialValue: T
): LiveQueryResult<T> {
	let value = $state(initialValue);
	let loading = $state(true);

	if (browser) {
		let sub: { unsubscribe(): void } | null = null;

		$effect(() => {
			sub?.unsubscribe();
			loading = true;
			const obs: Observable<T> = liveQuery(querier);
			sub = obs.subscribe({
				next: (result) => {
					value = result;
					loading = false;
				},
				error: () => {
					loading = false;
				}
			});
			return () => sub?.unsubscribe();
		});
	}

	return {
		get value() {
			return value;
		},
		get loading() {
			return loading;
		}
	};
}
