/**
 * Generates the cross-language analytics constants from constants.json — the
 * single source of truth shared by the TS server/web and the Kotlin mobile
 * analytics. Run with `bun run constants:generate`; `bun run constants:check`
 * (CI-enforced) fails when the generated files drift from the source.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type RdaRow = {
	nutrientKey: string;
	unit: string;
	rdaMale: number;
	rdaFemale: number;
	earMale: number | null;
	earFemale: number | null;
	referenceType: 'rda' | 'ai' | 'cdrr';
	per1000Kcal: number | null;
	label: string;
};
type DiiRow = { coefficient: number; globalMean: number; globalSd: number };
type Spec = {
	energy: {
		kcalPerKgFat: number;
		kcalPerKgMuscle: number;
		defaultMuscleRatio: number;
		expenditurePerKgKcalPerDay: number;
	};
	tdee: { plateauThresholdKgPerWeek: number; minPlateauSpanDays: number };
	omegaRatio: { optimalMax: number; elevatedMax: number };
	coverage: { minDayFraction: number };
	caffeine: { defaultCutoffHour: number };
	protein: { targetFeedingsPerDay: number; perMealGramsPerKg: number; defaultPerMealGrams: number };
	dii: {
		zeroValidNutrients: string[];
		neutralCutpoint: number;
		fullIndexAbsCoefficientSum: number;
		caffeineMgPerTableUnit: number;
		nutrients: Record<string, DiiRow>;
	};
	rda: RdaRow[];
};

const here = dirname(fileURLToPath(import.meta.url));
const spec: Spec = JSON.parse(readFileSync(resolve(here, 'constants.json'), 'utf-8'));

const HEADER =
	'// GENERATED FILE — DO NOT EDIT.\n' +
	'// Source of truth: analytics-parity/constants.json. Regenerate with `bun run constants:generate`.\n';

// Kotlin Double literals need an explicit decimal point.
const kt = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

function tsFile(): string {
	const rda = spec.rda
		.map(
			(r) =>
				`\t{\n\t\tnutrientKey: '${r.nutrientKey}',\n\t\tunit: '${r.unit}',\n\t\trdaMale: ${r.rdaMale},\n\t\trdaFemale: ${r.rdaFemale},\n\t\tearMale: ${r.earMale},\n\t\tearFemale: ${r.earFemale},\n\t\treferenceType: '${r.referenceType}',\n\t\tper1000Kcal: ${r.per1000Kcal},\n\t\tlabel: '${r.label}'\n\t}`
		)
		.join(',\n');
	const diiEntries = Object.entries(spec.dii.nutrients);
	const record = (pick: (row: DiiRow) => number) =>
		diiEntries.map(([k, row]) => `\t${k}: ${pick(row)}`).join(',\n');
	return `${HEADER}
/** How a reference value should be read: an RDA (with EAR), an Adequate Intake, or the sodium CDRR ceiling. */
export type ReferenceType = 'rda' | 'ai' | 'cdrr';

export type RDAEntry = {
	nutrientKey: string;
	unit: string;
	rdaMale: number;
	rdaFemale: number;
	earMale: number | null;
	earFemale: number | null;
	referenceType: ReferenceType;
	/** For energy-scaled AIs (fiber): the reference per 1000 kcal, overriding rdaMale/rdaFemale. */
	per1000Kcal: number | null;
	label: string;
};

export const RDA_VALUES: RDAEntry[] = [
${rda}
];

export const DII_COEFFICIENTS: Record<string, number> = {
${record((r) => r.coefficient)}
};

export const DII_GLOBAL_MEAN: Record<string, number> = {
${record((r) => r.globalMean)}
};

export const DII_GLOBAL_SD: Record<string, number> = {
${record((r) => r.globalSd)}
};

export const ZERO_VALID_NUTRIENTS: string[] = [${spec.dii.zeroValidNutrients.map((n) => `'${n}'`).join(', ')}];
export const DII_NEUTRAL_CUTPOINT = ${spec.dii.neutralCutpoint};
export const DII_FULL_INDEX_ABS_COEF_SUM = ${spec.dii.fullIndexAbsCoefficientSum};
export const DII_CAFFEINE_MG_PER_TABLE_UNIT = ${spec.dii.caffeineMgPerTableUnit};

export const KCAL_PER_KG_FAT = ${spec.energy.kcalPerKgFat};
export const KCAL_PER_KG_MUSCLE = ${spec.energy.kcalPerKgMuscle};
export const DEFAULT_MUSCLE_RATIO = ${spec.energy.defaultMuscleRatio};
export const EXPENDITURE_PER_KG_KCAL_PER_DAY = ${spec.energy.expenditurePerKgKcalPerDay};

export const PLATEAU_THRESHOLD_KG_PER_WEEK = ${spec.tdee.plateauThresholdKgPerWeek};
export const PLATEAU_MIN_SPAN_DAYS = ${spec.tdee.minPlateauSpanDays};

export const OMEGA_RATIO_OPTIMAL_MAX = ${spec.omegaRatio.optimalMax};
export const OMEGA_RATIO_ELEVATED_MAX = ${spec.omegaRatio.elevatedMax};

export const MIN_NUTRIENT_COVERAGE = ${spec.coverage.minDayFraction};

export const DEFAULT_CAFFEINE_CUTOFF_HOUR = ${spec.caffeine.defaultCutoffHour};

export const PROTEIN_TARGET_FEEDINGS_PER_DAY = ${spec.protein.targetFeedingsPerDay};
export const PROTEIN_PER_MEAL_G_PER_KG = ${spec.protein.perMealGramsPerKg};
export const PROTEIN_DEFAULT_PER_MEAL_G = ${spec.protein.defaultPerMealGrams};
`;
}

function ktFile(): string {
	const ktOpt = (v: number | null) => (v === null ? 'null' : kt(v));
	const rda = spec.rda
		.map(
			(r) =>
				`        RdaEntry("${r.nutrientKey}", "${r.unit}", ${kt(r.rdaMale)}, ${kt(r.rdaFemale)}, "${r.label}", ${ktOpt(r.earMale)}, ${ktOpt(r.earFemale)}, "${r.referenceType}", ${ktOpt(r.per1000Kcal)}),`
		)
		.join('\n');
	const diiEntries = Object.entries(spec.dii.nutrients);
	const map = (pick: (row: DiiRow) => number) =>
		diiEntries.map(([k, row]) => `        "${k}" to ${kt(pick(row))},`).join('\n');
	return `${HEADER}package com.bissbilanz.analytics

val RDA_VALUES: List<RdaEntry> =
    listOf(
${rda}
    )

val DII_COEFFICIENTS: Map<String, Double> =
    mapOf(
${map((r) => r.coefficient)}
    )

val DII_GLOBAL_MEAN: Map<String, Double> =
    mapOf(
${map((r) => r.globalMean)}
    )

val DII_GLOBAL_SD: Map<String, Double> =
    mapOf(
${map((r) => r.globalSd)}
    )

val ZERO_VALID_NUTRIENTS: Set<String> = setOf(${spec.dii.zeroValidNutrients.map((n) => `"${n}"`).join(', ')})
const val DII_NEUTRAL_CUTPOINT = ${kt(spec.dii.neutralCutpoint)}
const val DII_FULL_INDEX_ABS_COEF_SUM = ${kt(spec.dii.fullIndexAbsCoefficientSum)}
const val DII_CAFFEINE_MG_PER_TABLE_UNIT = ${kt(spec.dii.caffeineMgPerTableUnit)}

const val KCAL_PER_KG_FAT = ${kt(spec.energy.kcalPerKgFat)}
const val KCAL_PER_KG_MUSCLE = ${kt(spec.energy.kcalPerKgMuscle)}
const val DEFAULT_MUSCLE_RATIO = ${spec.energy.defaultMuscleRatio}
const val EXPENDITURE_PER_KG_KCAL_PER_DAY = ${kt(spec.energy.expenditurePerKgKcalPerDay)}

const val PLATEAU_THRESHOLD_KG_PER_WEEK = ${spec.tdee.plateauThresholdKgPerWeek}
const val PLATEAU_MIN_SPAN_DAYS = ${spec.tdee.minPlateauSpanDays}

const val OMEGA_RATIO_OPTIMAL_MAX = ${kt(spec.omegaRatio.optimalMax)}
const val OMEGA_RATIO_ELEVATED_MAX = ${kt(spec.omegaRatio.elevatedMax)}

const val MIN_NUTRIENT_COVERAGE = ${spec.coverage.minDayFraction}

const val DEFAULT_CAFFEINE_CUTOFF_HOUR = ${spec.caffeine.defaultCutoffHour}

const val PROTEIN_TARGET_FEEDINGS_PER_DAY = ${spec.protein.targetFeedingsPerDay}
const val PROTEIN_PER_MEAL_G_PER_KG = ${spec.protein.perMealGramsPerKg}
const val PROTEIN_DEFAULT_PER_MEAL_G = ${kt(spec.protein.defaultPerMealGrams)}
`;
}

const targets = [
	{ path: resolve(here, '../src/lib/analytics/constants.generated.ts'), content: tsFile() },
	{
		path: resolve(
			here,
			'../mobile/shared/src/commonMain/kotlin/com/bissbilanz/analytics/GeneratedAnalyticsConstants.kt'
		),
		content: ktFile()
	}
];

const checkMode = process.argv.includes('--check');
let drift = false;
for (const { path, content } of targets) {
	if (checkMode) {
		let current = '';
		try {
			current = readFileSync(path, 'utf-8');
		} catch {
			// missing file counts as drift
		}
		if (current !== content) {
			console.error(`DRIFT: ${path} is stale — run \`bun run constants:generate\``);
			drift = true;
		}
	} else {
		writeFileSync(path, content);
		console.log(`Wrote ${path}`);
	}
}
if (checkMode) {
	if (drift) process.exit(1);
	console.log('Generated analytics constants are up to date.');
}
