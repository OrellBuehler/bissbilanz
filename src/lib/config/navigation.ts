import Home from '@lucide/svelte/icons/home';
import Heart from '@lucide/svelte/icons/heart';
import Utensils from '@lucide/svelte/icons/utensils';
import CookingPot from '@lucide/svelte/icons/cooking-pot';
import Pill from '@lucide/svelte/icons/pill';
import Target from '@lucide/svelte/icons/target';
import Calendar from '@lucide/svelte/icons/calendar';
import Settings from '@lucide/svelte/icons/settings';
import * as m from '$lib/paraglide/messages';
import type { Component } from 'svelte';

export type NavItem = {
	title: () => string;
	href: string;
	icon: Component;
};

export function getNavItems(): NavItem[] {
	return [
		{ title: () => m.nav_dashboard(), href: '/app', icon: Home },
		{ title: () => m.nav_favorites(), href: '/app/favorites', icon: Heart },
		{ title: () => m.nav_foods(), href: '/app/foods', icon: Utensils },
		{ title: () => m.nav_recipes(), href: '/app/recipes', icon: CookingPot },
		{ title: () => m.nav_supplements(), href: '/app/supplements', icon: Pill },
		{ title: () => m.nav_goals(), href: '/app/goals', icon: Target },
		{ title: () => m.nav_history(), href: '/app/history', icon: Calendar },
		{ title: () => m.nav_settings(), href: '/app/settings', icon: Settings }
	];
}
