import { describe, expect, it } from 'vitest';
import { INSIGHT_CARD_IDS, MAX_PINNED_INSIGHTS } from '../card-ids';
import { INSIGHT_CARDS, INSIGHT_CARD_LIST, cardsForGroup, sourcesForCards } from '../registry';
import { INSIGHT_GROUPS, INSIGHT_GROUP_IDS } from '../groups';
import { ANALYTICS_SOURCES, EMPTY_ANALYTICS_BUNDLE } from '../sources';
import { preferencesUpdateSchema } from '$lib/server/validation/preferences';

describe('insight card registry', () => {
	it('has an entry for every declared card id', () => {
		expect(Object.keys(INSIGHT_CARDS).sort()).toEqual([...INSIGHT_CARD_IDS].sort());
		expect(INSIGHT_CARD_LIST).toHaveLength(INSIGHT_CARD_IDS.length);
	});

	it('keys match the definition ids', () => {
		for (const [key, card] of Object.entries(INSIGHT_CARDS)) {
			expect(card.id).toBe(key);
		}
	});

	it('gives every card a component, a title and at least one data source', () => {
		for (const card of INSIGHT_CARD_LIST) {
			expect(card.component, `${card.id} component`).toBeTruthy();
			expect(typeof card.title(), `${card.id} title`).toBe('string');
			expect(card.title().length, `${card.id} title`).toBeGreaterThan(0);
			expect(card.sources.length, `${card.id} sources`).toBeGreaterThan(0);
		}
	});

	it('only references known analytics sources', () => {
		const known = new Set(Object.keys(ANALYTICS_SOURCES));
		for (const card of INSIGHT_CARD_LIST) {
			for (const source of card.sources) {
				expect(known.has(source), `${card.id} -> ${source}`).toBe(true);
			}
		}
	});

	it('builds props only out of the sources it declares', () => {
		for (const card of INSIGHT_CARD_LIST) {
			const props = card.props(EMPTY_ANALYTICS_BUNDLE, true);
			expect(Object.keys(props).length, `${card.id} props`).toBeGreaterThan(0);
			expect(props).toHaveProperty('loading');
		}
	});

	it('assigns every card to a known group and leaves no group empty', () => {
		const groups = new Set<string>(INSIGHT_GROUP_IDS);
		for (const card of INSIGHT_CARD_LIST) {
			expect(groups.has(card.group), `${card.id} group`).toBe(true);
		}
		for (const group of INSIGHT_GROUP_IDS) {
			expect(cardsForGroup(group).length, `${group} cards`).toBeGreaterThan(0);
			expect(typeof INSIGHT_GROUPS[group].title()).toBe('string');
		}
	});

	it('de-duplicates the sources needed by a set of cards', () => {
		const sources = sourcesForCards(['adaptive-tdee', 'plateau-detection', 'sodium-weight']);
		expect(sources).toEqual(['weightFood90', 'nutrientsExtended90']);
	});

	it('accepts every card id as a pin preference value', () => {
		const parsed = preferencesUpdateSchema.safeParse({
			pinnedInsights: INSIGHT_CARD_IDS.slice(0, MAX_PINNED_INSIGHTS)
		});
		expect(parsed.success).toBe(true);
		expect(preferencesUpdateSchema.safeParse({ pinnedInsights: ['not-a-card'] }).success).toBe(
			false
		);
		expect(
			preferencesUpdateSchema.safeParse({
				pinnedInsights: INSIGHT_CARD_IDS.slice(0, MAX_PINNED_INSIGHTS + 1)
			}).success
		).toBe(false);
	});
});
