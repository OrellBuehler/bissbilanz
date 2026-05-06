<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { SortableList, sortItems } from '@rodrigodagostino/svelte-sortable-list';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import * as m from '$lib/paraglide/messages';

	const WIDGET_KEYS = ['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog'] as const;
	type WidgetKey = (typeof WIDGET_KEYS)[number];

	const WIDGET_DEFS: Record<WidgetKey, { name: () => string; desc: () => string }> &
		Record<string, { name: () => string; desc: () => string }> = {
		chart: {
			name: () => m.settings_section_chart(),
			desc: () => m.settings_section_chart_desc()
		},
		streaks: {
			name: () => m.settings_section_streaks(),
			desc: () => m.settings_section_streaks_desc()
		},
		favorites: {
			name: () => m.settings_widget_favorites(),
			desc: () => m.settings_widget_favorites_desc()
		},
		supplements: {
			name: () => m.settings_widget_supplements(),
			desc: () => m.settings_widget_supplements_desc()
		},
		weight: {
			name: () => m.settings_widget_weight(),
			desc: () => m.settings_widget_weight_desc()
		},
		'meal-breakdown': {
			name: () => m.settings_widget_meal_breakdown(),
			desc: () => m.settings_widget_meal_breakdown_desc()
		},
		'top-foods': {
			name: () => m.settings_widget_top_foods(),
			desc: () => m.settings_widget_top_foods_desc()
		},
		sleep: {
			name: () => m.settings_widget_sleep(),
			desc: () => m.settings_widget_sleep_desc()
		},
		summary: {
			name: () => m.settings_section_summary(),
			desc: () => m.settings_section_summary_desc()
		},
		daylog: {
			name: () => m.settings_section_daylog(),
			desc: () => m.settings_section_daylog_desc()
		}
	};

	export type WidgetVisibility = {
		chart: boolean;
		favorites: boolean;
		supplements: boolean;
		weight: boolean;
		mealBreakdown: boolean;
		topFoods: boolean;
		sleep: boolean;
	};

	type Props = {
		order: string[];
		visibility: WidgetVisibility;
		onSavePreference: (key: string, value: unknown) => void;
	};

	let { order, visibility, onSavePreference }: Props = $props();

	let widgetOrder = $state<
		Array<{ id: string; name: () => string; desc: () => string; key: string }>
	>([]);

	$effect(() => {
		widgetOrder = order.map((key) => ({
			id: key,
			key,
			name: WIDGET_DEFS[key]?.name ?? (() => key),
			desc: WIDGET_DEFS[key]?.desc ?? (() => '')
		}));
	});

	const handleSort = (event: any) => {
		const { draggedItemIndex, targetItemIndex } = event;
		if (draggedItemIndex == null || targetItemIndex == null) return;
		widgetOrder = sortItems(widgetOrder, draggedItemIndex, targetItemIndex);
		const newOrder = widgetOrder.map((w) => w.key);
		onSavePreference('widgetOrder', newOrder);
	};
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_dashboard_sections()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<SortableList.Root gap={8} ondrop={handleSort}>
			{#each widgetOrder as widget, index (widget.id)}
				<SortableList.Item id={widget.id} {index}>
					<div class="flex items-center gap-3 rounded-md border p-3">
						<SortableList.ItemHandle>
							<GripVertical class="text-muted-foreground h-5 w-5 cursor-grab" />
						</SortableList.ItemHandle>
						<div class="flex-1">
							<p class="text-sm font-medium">{widget.name()}</p>
							<p class="text-muted-foreground text-xs">{widget.desc()}</p>
						</div>
						{#if widget.key === 'chart'}
							<Switch
								checked={visibility.chart}
								onCheckedChange={(v) => onSavePreference('showChartWidget', v)}
							/>
						{:else if widget.key === 'favorites'}
							<Switch
								checked={visibility.favorites}
								onCheckedChange={(v) => onSavePreference('showFavoritesWidget', v)}
							/>
						{:else if widget.key === 'supplements'}
							<Switch
								checked={visibility.supplements}
								onCheckedChange={(v) => onSavePreference('showSupplementsWidget', v)}
							/>
						{:else if widget.key === 'weight'}
							<Switch
								checked={visibility.weight}
								onCheckedChange={(v) => onSavePreference('showWeightWidget', v)}
							/>
						{:else if widget.key === 'meal-breakdown'}
							<Switch
								checked={visibility.mealBreakdown}
								onCheckedChange={(v) => onSavePreference('showMealBreakdownWidget', v)}
							/>
						{:else if widget.key === 'top-foods'}
							<Switch
								checked={visibility.topFoods}
								onCheckedChange={(v) => onSavePreference('showTopFoodsWidget', v)}
							/>
						{:else if widget.key === 'sleep'}
							<Switch
								checked={visibility.sleep}
								onCheckedChange={(v) => onSavePreference('showSleepWidget', v)}
							/>
						{/if}
					</div>
				</SortableList.Item>
			{/each}
		</SortableList.Root>
	</Card.Content>
</Card.Root>
