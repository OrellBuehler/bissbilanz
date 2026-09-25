import Rocket from '@lucide/svelte/icons/rocket';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
import Utensils from '@lucide/svelte/icons/utensils';
import CookingPot from '@lucide/svelte/icons/cooking-pot';
import Target from '@lucide/svelte/icons/target';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import ChartBar from '@lucide/svelte/icons/chart-bar';
import Sparkles from '@lucide/svelte/icons/sparkles';
import FileUp from '@lucide/svelte/icons/file-up';
import Smartphone from '@lucide/svelte/icons/smartphone';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import * as m from '$lib/paraglide/messages';
import type { Component } from 'svelte';

/**
 * Platform a guide (or a section of one) applies to. Guides can mix web-only,
 * iOS-only and Android-only content — the content component shows small
 * badges on sections that do not apply everywhere.
 */
export type HelpPlatform = 'web' | 'ios' | 'android';

export type HelpGuide = {
	/**
	 * Fixed contract shared with the mobile apps — their "Learn more" links
	 * target `/help/<slug>` and `/de/help/<slug>` directly, so slugs must never
	 * change without coordinating a mobile release. Also the key used to look
	 * up this guide's content component in `./content/index.ts`.
	 */
	slug: string;
	icon: Component;
	platforms: HelpPlatform[];
	title: () => string;
	summary: () => string;
};

export const helpGuides: HelpGuide[] = [
	{
		slug: 'getting-started',
		icon: Rocket,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_getting_started_title(),
		summary: () => m.help_guide_getting_started_summary()
	},
	{
		slug: 'logging',
		icon: ClipboardList,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_logging_title(),
		summary: () => m.help_guide_logging_summary()
	},
	{
		slug: 'scanning',
		icon: ScanBarcode,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_scanning_title(),
		summary: () => m.help_guide_scanning_summary()
	},
	{
		slug: 'food-database',
		icon: Utensils,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_food_database_title(),
		summary: () => m.help_guide_food_database_summary()
	},
	{
		slug: 'recipes',
		icon: CookingPot,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_recipes_title(),
		summary: () => m.help_guide_recipes_summary()
	},
	{
		slug: 'goals-maintenance',
		icon: Target,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_goals_maintenance_title(),
		summary: () => m.help_guide_goals_maintenance_summary()
	},
	{
		slug: 'body-tracking',
		icon: HeartPulse,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_body_tracking_title(),
		summary: () => m.help_guide_body_tracking_summary()
	},
	{
		slug: 'insights',
		icon: ChartBar,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_insights_title(),
		summary: () => m.help_guide_insights_summary()
	},
	{
		slug: 'ai-assistant',
		icon: Sparkles,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_ai_assistant_title(),
		summary: () => m.help_guide_ai_assistant_summary()
	},
	{
		slug: 'import-export',
		icon: FileUp,
		platforms: ['web'],
		title: () => m.help_guide_import_export_title(),
		summary: () => m.help_guide_import_export_summary()
	},
	{
		slug: 'mobile-extras',
		icon: Smartphone,
		platforms: ['ios', 'android'],
		title: () => m.help_guide_mobile_extras_title(),
		summary: () => m.help_guide_mobile_extras_summary()
	},
	{
		slug: 'sync-offline',
		icon: RefreshCw,
		platforms: ['web', 'ios', 'android'],
		title: () => m.help_guide_sync_offline_title(),
		summary: () => m.help_guide_sync_offline_summary()
	}
];

export const getHelpGuide = (slug: string): HelpGuide | undefined =>
	helpGuides.find((guide) => guide.slug === slug);
