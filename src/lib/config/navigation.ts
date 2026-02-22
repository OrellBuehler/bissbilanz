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
	activeBg: string;
};

export function getNavItems(): NavItem[] {
	return [
		{
			title: () => m.nav_dashboard(),
			href: '/',
			icon: Home,
			badgeColor: 'bg-blue-100 text-blue-600',
			activeBg: 'bg-blue-100/60 dark:bg-blue-950/40'
		},
		{
			title: () => m.nav_favorites(),
			href: '/favorites',
			icon: Heart,
			badgeColor: 'bg-red-100 text-red-600',
			activeBg: 'bg-red-100/60 dark:bg-red-950/40'
		},
		{
			title: () => m.nav_foods(),
			href: '/foods',
			icon: Utensils,
			badgeColor: 'bg-orange-100 text-orange-600',
			activeBg: 'bg-orange-100/60 dark:bg-orange-950/40'
		},
		{
			title: () => m.nav_recipes(),
			href: '/recipes',
			icon: CookingPot,
			badgeColor: 'bg-green-100 text-green-600',
			activeBg: 'bg-green-100/60 dark:bg-green-950/40'
		},
		{
			title: () => m.nav_supplements(),
			href: '/supplements',
			icon: Pill,
			badgeColor: 'bg-purple-100 text-purple-600',
			activeBg: 'bg-purple-100/60 dark:bg-purple-950/40'
		},
		{
			title: () => m.nav_weight(),
			href: '/weight',
			icon: Weight,
			badgeColor: 'bg-teal-100 text-teal-600',
			activeBg: 'bg-teal-100/60 dark:bg-teal-950/40'
		},
		{
			title: () => m.nav_goals(),
			href: '/goals',
			icon: Target,
			badgeColor: 'bg-amber-100 text-amber-600',
			activeBg: 'bg-amber-100/60 dark:bg-amber-950/40'
		},
		{
			title: () => m.nav_history(),
			href: '/history',
			icon: Calendar,
			badgeColor: 'bg-indigo-100 text-indigo-600',
			activeBg: 'bg-indigo-100/60 dark:bg-indigo-950/40'
		},
		{
			title: () => m.nav_settings(),
			href: '/settings',
			icon: Settings,
			badgeColor: 'bg-slate-100 text-slate-600',
			activeBg: 'bg-slate-100/60 dark:bg-slate-950/40'
		}
	];
}
