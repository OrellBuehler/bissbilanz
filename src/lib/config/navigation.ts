import Home from '@lucide/svelte/icons/home';
import Heart from '@lucide/svelte/icons/heart';
import Utensils from '@lucide/svelte/icons/utensils';
import CookingPot from '@lucide/svelte/icons/cooking-pot';
import Pill from '@lucide/svelte/icons/pill';
import Weight from '@lucide/svelte/icons/weight';
import Target from '@lucide/svelte/icons/target';
import Calendar from '@lucide/svelte/icons/calendar';
import Settings from '@lucide/svelte/icons/settings';
import * as m from '$lib/paraglide/messages';
import type { Component } from 'svelte';

export type NavItem = {
	title: () => string;
	href: string;
	icon: Component;
	badgeColor: string;
};

export function getNavItems(): NavItem[] {
	return [
		{ title: () => m.nav_dashboard(), href: '/', icon: Home, badgeColor: 'bg-blue-500' },
		{ title: () => m.nav_favorites(), href: '/favorites', icon: Heart, badgeColor: 'bg-red-500' },
		{ title: () => m.nav_foods(), href: '/foods', icon: Utensils, badgeColor: 'bg-orange-500' },
		{
			title: () => m.nav_recipes(),
			href: '/recipes',
			icon: CookingPot,
			badgeColor: 'bg-green-500'
		},
		{
			title: () => m.nav_supplements(),
			href: '/supplements',
			icon: Pill,
			badgeColor: 'bg-purple-500'
		},
		{ title: () => m.nav_weight(), href: '/weight', icon: Weight, badgeColor: 'bg-teal-500' },
		{ title: () => m.nav_goals(), href: '/goals', icon: Target, badgeColor: 'bg-amber-500' },
		{ title: () => m.nav_history(), href: '/history', icon: Calendar, badgeColor: 'bg-indigo-500' },
		{ title: () => m.nav_settings(), href: '/settings', icon: Settings, badgeColor: 'bg-slate-600' }
	];
}
