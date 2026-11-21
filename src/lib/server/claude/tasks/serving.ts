import { per100Scale, unitDimension, type ServingUnit } from '$lib/units';
import { compareWithRecord, type FdcFood, type ServingMacros } from '../../fooddata-central';

export type Measure = { amount: number; unit: 'g' | 'ml' };

const FACTORS: Record<string, { unit: Measure['unit']; factor: number }> = {
	ml: { unit: 'ml', factor: 1 },
	cl: { unit: 'ml', factor: 10 },
	dl: { unit: 'ml', factor: 100 },
	l: { unit: 'ml', factor: 1000 },
	liter: { unit: 'ml', factor: 1000 },
	liters: { unit: 'ml', factor: 1000 },
	litre: { unit: 'ml', factor: 1000 },
	litres: { unit: 'ml', factor: 1000 },
	g: { unit: 'g', factor: 1 },
	kg: { unit: 'g', factor: 1000 }
};

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(ml|cl|dl|kg|g|l|liters?|litres?)(?![a-z])`;
const MULTIPACK = new RegExp(String.raw`(\d+)\s*[x×]\s*${NUMBER}\s*${UNIT}`, 'i');
const SINGLE = new RegExp(`${NUMBER}\\s*${UNIT}`, 'i');

const measureOf = (value: string, unit: string): Measure => {
	const row = FACTORS[unit.toLowerCase()]!;
	return {
		amount: Math.round(Number(value.replace(',', '.')) * row.factor * 100) / 100,
		unit: row.unit
	};
};

/** The first amount in a pack text such as "330 ml", "1 can (330 ml)" or "6 x 33 cl" (one unit of a multipack). */
export function parseMeasure(text: string | null | undefined): Measure | null {
	if (!text) return null;
	const multi = MULTIPACK.exec(text);
	if (multi) return measureOf(multi[2]!, multi[3]!);
	const inBrackets = /\(([^)]*)\)/.exec(text)?.[1];
	const found = (inBrackets ? SINGLE.exec(inBrackets) : null) ?? SINGLE.exec(text);
	return found ? measureOf(found[1]!, found[2]!) : null;
}

/** Most a container can hold and still be one person's serving: a can, a small bottle, a cup. */
export const SINGLE_SERVE_MAX_ML = 500;

export type ServingHint = {
	liquid: boolean;
	// What one serving should be: the printed serving, or the whole small container.
	suggested: (Measure & { kind: 'label' | 'container'; text: string }) | null;
};

export const NO_HINT: ServingHint = { liquid: false, suggested: null };

/** What an Open Food Facts product says about its unit and serving, from the texts printed on the pack. */
export function servingHint(product: {
	quantity?: unknown;
	servingDescription?: unknown;
}): ServingHint {
	const quantityText = typeof product.quantity === 'string' ? product.quantity : null;
	const servingText =
		typeof product.servingDescription === 'string' ? product.servingDescription : null;
	const quantity = parseMeasure(quantityText);
	const serving = parseMeasure(servingText);
	const liquid = quantity?.unit === 'ml' || serving?.unit === 'ml';
	if (serving) {
		const container =
			quantity && Math.abs(quantity.amount - serving.amount) <= 0.05 * quantity.amount;
		return {
			liquid,
			suggested: {
				...serving,
				kind: container ? 'container' : 'label',
				text: servingText!
			}
		};
	}
	if (quantity?.unit === 'ml' && quantity.amount <= SINGLE_SERVE_MAX_ML) {
		return { liquid, suggested: { ...quantity, kind: 'container', text: quantityText! } };
	}
	return { liquid, suggested: null };
}

export type OffHint = {
	name: string;
	serving: ServingHint;
	per100: Pick<FdcFood['per100g'], 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>;
};

const asNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

export function offHintOf(product: Record<string, unknown>): OffHint {
	return {
		name: typeof product.name === 'string' ? product.name : '',
		serving: servingHint(product),
		per100: {
			calories: asNumber(product.calories),
			protein: asNumber(product.protein),
			carbs: asNumber(product.carbs),
			fat: asNumber(product.fat),
			fiber: asNumber(product.fiber)
		}
	};
}

const isMass = (unit: string) => unitDimension(unit as ServingUnit) === 'mass';

const round = (value: number) => Math.round(value * 100) / 100;

export type ServingFood = ServingMacros & { servingSize: number; servingUnit: string };

/**
 * What is wrong with a create_food call when the model pulled the product from
 * Open Food Facts earlier in the run, or null. Each finding is likely but not
 * certain (a label can differ from the record, ice cream is sold by volume and
 * labelled per 100 g), so the caller reports it once and lets an unchanged
 * repeat through.
 */
export function checkAgainstOff(
	food: ServingFood,
	hint: OffHint,
	options: { realServings: boolean; checkValues: boolean }
): string | null {
	const problems: string[] = [];
	const { liquid, suggested } = hint.serving;
	let rescaled = false;

	if (liquid && isMass(food.servingUnit)) {
		rescaled = true;
		problems.push(
			`Open Food Facts gives this product's content in ml, so it is a liquid, but you set servingUnit ${food.servingUnit}. Liquids use ml. Its per-100 figures are per 100 ml, so only the unit you scale them to changes.`
		);
	}
	if (options.realServings && suggested && food.servingSize === 100 && suggested.amount !== 100) {
		rescaled = true;
		const because =
			suggested.kind === 'container'
				? 'it is a single-serve container, so the whole container is one serving'
				: 'it is the serving printed on the pack';
		problems.push(
			`You set servingSize 100, but the pack says "${suggested.text}": ${because}. Use servingSize ${suggested.amount} ${suggested.unit} and multiply every per-100 value by ${round(suggested.amount / 100)}.`
		);
	}
	if (rescaled) {
		return `${problems.join(' ')} Nothing was created. Fix this and call create_food again with every value scaled to the serving you store. If the pack and the nutrition table really are as you set them (for example ice cream sold by volume but labelled per 100 g), repeat the call unchanged.`;
	}

	const scale = options.checkValues
		? per100Scale(food.servingSize, food.servingUnit as ServingUnit, ['mass', 'volume'])
		: null;
	if (scale === null) return null;
	const record: FdcFood = {
		fdcId: 0,
		description: hint.name,
		dataType: 'Open Food Facts',
		per100g: hint.per100,
		nutrients: {}
	};
	const comparison = compareWithRecord(record, food, scale);
	if (comparison.matches) return null;
	return `Your ${comparison.mismatched.join(', ')} for ${food.servingSize} ${food.servingUnit} do not match Open Food Facts for this barcode scaled to that serving (${Object.entries(
		comparison.recordPerServing
	)
		.map(([key, value]) => `${key} ${value}`)
		.join(
			', '
		)}). Open Food Facts figures are per 100 g or ml: multiply them by servingSize ÷ 100. Nothing was created. If the label in the photo differs from Open Food Facts, repeat the call unchanged.`;
}
