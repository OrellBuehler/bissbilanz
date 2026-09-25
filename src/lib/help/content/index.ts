import type { Component } from 'svelte';

// Eager imports: content must be ready synchronously during SSR so guides are
// actually indexable (a lazy `import()` resolves as a pending promise during
// SvelteKit's synchronous SSR render, leaving the initial HTML empty). This
// file is only imported from the guide detail route, so the index page,
// sitemap and settings screens — which only need slug/title/summary from
// `guides.ts` — don't pull all 24 content components into their bundle.
import GettingStartedEn from './en/getting-started.svelte';
import LoggingEn from './en/logging.svelte';
import ScanningEn from './en/scanning.svelte';
import FoodDatabaseEn from './en/food-database.svelte';
import RecipesEn from './en/recipes.svelte';
import GoalsMaintenanceEn from './en/goals-maintenance.svelte';
import BodyTrackingEn from './en/body-tracking.svelte';
import InsightsEn from './en/insights.svelte';
import AiAssistantEn from './en/ai-assistant.svelte';
import ImportExportEn from './en/import-export.svelte';
import MobileExtrasEn from './en/mobile-extras.svelte';
import SyncOfflineEn from './en/sync-offline.svelte';

import GettingStartedDe from './de/getting-started.svelte';
import LoggingDe from './de/logging.svelte';
import ScanningDe from './de/scanning.svelte';
import FoodDatabaseDe from './de/food-database.svelte';
import RecipesDe from './de/recipes.svelte';
import GoalsMaintenanceDe from './de/goals-maintenance.svelte';
import BodyTrackingDe from './de/body-tracking.svelte';
import InsightsDe from './de/insights.svelte';
import AiAssistantDe from './de/ai-assistant.svelte';
import ImportExportDe from './de/import-export.svelte';
import MobileExtrasDe from './de/mobile-extras.svelte';
import SyncOfflineDe from './de/sync-offline.svelte';

export const helpContent: Record<string, { en: Component; de: Component }> = {
	'getting-started': { en: GettingStartedEn, de: GettingStartedDe },
	logging: { en: LoggingEn, de: LoggingDe },
	scanning: { en: ScanningEn, de: ScanningDe },
	'food-database': { en: FoodDatabaseEn, de: FoodDatabaseDe },
	recipes: { en: RecipesEn, de: RecipesDe },
	'goals-maintenance': { en: GoalsMaintenanceEn, de: GoalsMaintenanceDe },
	'body-tracking': { en: BodyTrackingEn, de: BodyTrackingDe },
	insights: { en: InsightsEn, de: InsightsDe },
	'ai-assistant': { en: AiAssistantEn, de: AiAssistantDe },
	'import-export': { en: ImportExportEn, de: ImportExportDe },
	'mobile-extras': { en: MobileExtrasEn, de: MobileExtrasDe },
	'sync-offline': { en: SyncOfflineEn, de: SyncOfflineDe }
};
