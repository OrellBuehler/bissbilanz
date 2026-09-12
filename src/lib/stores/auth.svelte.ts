import { browser } from '$app/environment';
import type { UserProfile } from '$lib/server/types';
import { clearAllData, clearCacheStorage } from '$lib/db';
import { getSyncState } from '$lib/stores/sync-state.svelte';
import { syncQueue } from '$lib/stores/sync';

interface AuthState {
	user: UserProfile | null;
	isLoading: boolean;
	isAuthenticated: boolean;
}

let state = $state<AuthState>({
	user: null,
	isLoading: true,
	isAuthenticated: false
});

export function getAuthState(): AuthState {
	return state;
}

export function getUser(): UserProfile | null {
	return state.user;
}

export function isAuthenticated(): boolean {
	return state.isAuthenticated;
}

export function isLoading(): boolean {
	return state.isLoading;
}

export async function fetchUser(): Promise<void> {
	state.isLoading = true;
	try {
		const response = await fetch('/api/auth/me');
		if (!response.ok) {
			state.user = null;
			state.isAuthenticated = false;
			return;
		}
		const data = await response.json();
		state.user = data.user;
		state.isAuthenticated = !!data.user;
	} catch (error) {
		console.error('Failed to fetch user:', error);
		state.user = null;
		state.isAuthenticated = false;
	} finally {
		state.isLoading = false;
	}
}

export function login(provider = 'infomaniak'): void {
	window.location.href = `/api/auth/login?provider=${encodeURIComponent(provider)}`;
}

/**
 * Signs the user out. If offline writes are still queued, tries one sync
 * drain first; if changes remain pending after that, `confirmDiscard` (when
 * given) decides whether to proceed and lose them.
 */
export async function logout(confirmDiscard?: () => Promise<boolean>): Promise<void> {
	try {
		if (browser && getSyncState().pendingCount > 0) {
			if (navigator.onLine) await syncQueue();
			if (getSyncState().pendingCount > 0) {
				const proceed = confirmDiscard ? await confirmDiscard() : true;
				if (!proceed) return;
			}
		}
		await fetch('/api/auth/logout', { method: 'POST' });
		// Clear all cached data from Dexie and Cache Storage to prevent data leaking between users
		await clearAllData().catch(() => {});
		await clearCacheStorage().catch(() => {});
		state.user = null;
		state.isAuthenticated = false;
		window.location.href = '/login';
	} catch (error) {
		console.error('Logout failed:', error);
	}
}

export function setUser(user: UserProfile | null): void {
	state.user = user;
	state.isAuthenticated = !!user;
	state.isLoading = false;
}
