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
	activeRing: string;
};

export function getNavItems(): NavItem[] {
	return [
		{
			title: () => m.nav_dashboard(),
			href: '/',
			icon: Home,
			badgeColor: 'bg-blue-100 text-blue-600',
			activeRing: 'ring-2 ring-inset ring-blue-300 dark:ring-blue-700'
		},
		{
			title: () => m.nav_favorites(),
			href: '/favorites',
			icon: Heart,
			badgeColor: 'bg-red-100 text-red-600',
			activeRing: 'ring-2 ring-inset ring-red-300 dark:ring-red-700'
		},
		{
			title: () => m.nav_foods(),
			href: '/foods',
			icon: Utensils,
			badgeColor: 'bg-orange-100 text-orange-600',
			activeRing: 'ring-2 ring-inset ring-orange-300 dark:ring-orange-700'
		},
		{
			title: () => m.nav_recipes(),
			href: '/recipes',
			icon: CookingPot,
			badgeColor: 'bg-green-100 text-green-600',
			activeRing: 'ring-2 ring-inset ring-green-300 dark:ring-green-700'
		},
		{
			title: () => m.nav_supplements(),
			href: '/supplements',
			icon: Pill,
			badgeColor: 'bg-purple-100 text-purple-600',
			activeRing: 'ring-2 ring-inset ring-purple-300 dark:ring-purple-700'
		},
		{
			title: () => m.nav_weight(),
			href: '/weight',
			icon: Weight,
			badgeColor: 'bg-teal-100 text-teal-600',
			activeRing: 'ring-2 ring-inset ring-teal-300 dark:ring-teal-700'
		},
		{
			title: () => m.nav_goals(),
			href: '/goals',
			icon: Target,
			badgeColor: 'bg-amber-100 text-amber-600',
			activeRing: 'ring-2 ring-inset ring-amber-300 dark:ring-amber-700'
		},
		{
			title: () => m.nav_history(),
			href: '/history',
			icon: Calendar,
			badgeColor: 'bg-indigo-100 text-indigo-600',
			activeRing: 'ring-2 ring-inset ring-indigo-300 dark:ring-indigo-700'
		},
		{
			title: () => m.nav_settings(),
			href: '/settings',
			icon: Settings,
			badgeColor: 'bg-slate-100 text-slate-600',
			activeRing: 'ring-2 ring-inset ring-slate-300 dark:ring-slate-600'
		}
	];
}
