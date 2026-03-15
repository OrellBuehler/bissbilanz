import type { Observable } from 'dexie';
import { browser } from '$app/environment';

type LiveQueryResult<T> = {
	readonly value: T;
	readonly loading: boolean;
};

export function useLiveQuery<T>(factory: () => Observable<T>, initialValue: T): LiveQueryResult<T>;
export function useLiveQuery<T>(factory: () => Observable<T>): LiveQueryResult<T | undefined>;
export function useLiveQuery<T>(
	factory: () => Observable<T>,
	initialValue?: T
): LiveQueryResult<T | undefined> {
	let value = $state(initialValue);
	let loading = $state(true);

	if (browser) {
		let sub: { unsubscribe(): void } | null = null;

		$effect(() => {
			sub?.unsubscribe();
			loading = true;
			const obs = factory();
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
