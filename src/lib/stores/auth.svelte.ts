import type { UserProfile } from '$lib/server/types';

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

export function login(): void {
	window.location.href = '/api/auth/login';
}

export async function logout(): Promise<void> {
	try {
		await fetch('/api/auth/logout', { method: 'POST' });
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
