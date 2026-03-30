import Home from '@lucide/svelte/icons/home';
import Heart from '@lucide/svelte/icons/heart';
import Utensils from '@lucide/svelte/icons/utensils';
import CookingPot from '@lucide/svelte/icons/cooking-pot';
import Pill from '@lucide/svelte/icons/pill';
import Weight from '@lucide/svelte/icons/weight';
import ChartBar from '@lucide/svelte/icons/chart-bar';
import Target from '@lucide/svelte/icons/target';
import Calculator from '@lucide/svelte/icons/calculator';
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

export type NavGroup = {
	label?: () => string;
	items: NavItem[];
};

export const breadcrumbLabelKeys = [
	'app',
	'home',
	'foods',
	'recipes',
	'goals',
	'history',
	'settings',
	'favorites',
	'supplements',
	'weight',
	'insights',
	'new',
	'maintenance',
	'mcp'
] as const;

export function getNavGroups(): NavGroup[] {
	return [
		{
			items: [
				{
					title: () => m.nav_dashboard(),
					href: '/home',
					icon: Home,
					badgeColor: 'bg-blue-100 text-blue-600',
					activeRing: 'ring-2 ring-inset ring-blue-300/80 dark:ring-blue-700/80'
				},
				{
					title: () => m.nav_favorites(),
					href: '/favorites',
					icon: Heart,
					badgeColor: 'bg-red-100 text-red-600',
					activeRing: 'ring-2 ring-inset ring-red-300/80 dark:ring-red-700/80'
				},
				{
					title: () => m.nav_history(),
					href: '/history',
					icon: Calendar,
					badgeColor: 'bg-indigo-100 text-indigo-600',
					activeRing: 'ring-2 ring-inset ring-indigo-300/80 dark:ring-indigo-700/80'
				}
			]
		},
		{
			label: () => m.nav_group_manage(),
			items: [
				{
					title: () => m.nav_foods(),
					href: '/foods',
					icon: Utensils,
					badgeColor: 'bg-orange-100 text-orange-600',
					activeRing: 'ring-2 ring-inset ring-orange-300/80 dark:ring-orange-700/80'
				},
				{
					title: () => m.nav_recipes(),
					href: '/recipes',
					icon: CookingPot,
					badgeColor: 'bg-green-100 text-green-600',
					activeRing: 'ring-2 ring-inset ring-green-300/80 dark:ring-green-700/80'
				},
				{
					title: () => m.nav_supplements(),
					href: '/supplements',
					icon: Pill,
					badgeColor: 'bg-purple-100 text-purple-600',
					activeRing: 'ring-2 ring-inset ring-purple-300/80 dark:ring-purple-700/80'
				}
			]
		},
		{
			label: () => m.nav_group_analyze(),
			items: [
				{
					title: () => m.nav_insights(),
					href: '/insights',
					icon: ChartBar,
					badgeColor: 'bg-pink-100 text-pink-600',
					activeRing: 'ring-2 ring-inset ring-pink-300/80 dark:ring-pink-700/80'
				},
				{
					title: () => m.nav_goals(),
					href: '/goals',
					icon: Target,
					badgeColor: 'bg-amber-100 text-amber-600',
					activeRing: 'ring-2 ring-inset ring-amber-300/80 dark:ring-amber-700/80'
				},
				{
					title: () => m.nav_weight(),
					href: '/insights?tab=weight',
					icon: Weight,
					badgeColor: 'bg-teal-100 text-teal-600',
					activeRing: 'ring-2 ring-inset ring-teal-300/80 dark:ring-teal-700/80'
				},
				{
					title: () => m.nav_maintenance(),
					href: '/maintenance',
					icon: Calculator,
					badgeColor: 'bg-cyan-100 text-cyan-600',
					activeRing: 'ring-2 ring-inset ring-cyan-300/80 dark:ring-cyan-700/80'
				}
			]
		},
		{
			items: [
				{
					title: () => m.nav_settings(),
					href: '/settings',
					icon: Settings,
					badgeColor: 'bg-slate-100 text-slate-600',
					activeRing: 'ring-2 ring-inset ring-slate-300/80 dark:ring-slate-600/80'
				}
			]
		}
	];
}

export function getNavItems(): NavItem[] {
	return getNavGroups().flatMap((g) => g.items);
}

export type BottomNavTab = {
	id: string;
	title: () => string;
	href: string;
	icon: Component;
	activeIcon?: Component;
};

export const ALL_CONFIGURABLE_TABS: BottomNavTab[] = [
	{ id: 'favorites', title: () => m.nav_favorites(), href: '/favorites', icon: Heart },
	{ id: 'foods', title: () => m.nav_foods(), href: '/foods', icon: Utensils },
	{ id: 'insights', title: () => m.nav_insights(), href: '/insights', icon: ChartBar },
	{ id: 'weight', title: () => m.nav_weight(), href: '/insights?tab=weight', icon: Weight },
	{ id: 'supplements', title: () => m.nav_supplements(), href: '/supplements', icon: Pill }
];

export const DEFAULT_NAV_TABS = ['favorites', 'foods', 'insights'];

export function getBottomNavTabs(selectedIds: string[]): BottomNavTab[] {
	const fixed: BottomNavTab[] = [
		{ id: 'dashboard', title: () => m.nav_dashboard(), href: '/home', icon: Home }
	];
	const middle = ALL_CONFIGURABLE_TABS.filter((t) => selectedIds.includes(t.id));
	const settings: BottomNavTab[] = [
		{ id: 'settings', title: () => m.nav_settings(), href: '/settings', icon: Settings }
	];
	return [...fixed, ...middle, ...settings];
}
