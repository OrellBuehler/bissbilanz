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
	label: string;
};
type DiiRow = { coefficient: number; globalMean: number; globalSd: number };
type Spec = {
	energy: { kcalPerKgFat: number; kcalPerKgMuscle: number; defaultMuscleRatio: number };
	tdee: { plateauThresholdKgPerWeek: number };
	omegaRatio: { optimalMax: number; elevatedMax: number; highMax: number };
	dii: { zeroValidNutrients: string[]; nutrients: Record<string, DiiRow> };
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
				`\t{\n\t\tnutrientKey: '${r.nutrientKey}',\n\t\tunit: '${r.unit}',\n\t\trdaMale: ${r.rdaMale},\n\t\trdaFemale: ${r.rdaFemale},\n\t\tlabel: '${r.label}'\n\t}`
		)
		.join(',\n');
	const diiEntries = Object.entries(spec.dii.nutrients);
	const record = (pick: (row: DiiRow) => number) =>
		diiEntries.map(([k, row]) => `\t${k}: ${pick(row)}`).join(',\n');
	return `${HEADER}
export type RDAEntry = {
	nutrientKey: string;
	unit: string;
	rdaMale: number;
	rdaFemale: number;
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

export const KCAL_PER_KG_FAT = ${spec.energy.kcalPerKgFat};
export const KCAL_PER_KG_MUSCLE = ${spec.energy.kcalPerKgMuscle};
export const DEFAULT_MUSCLE_RATIO = ${spec.energy.defaultMuscleRatio};

export const PLATEAU_THRESHOLD_KG_PER_WEEK = ${spec.tdee.plateauThresholdKgPerWeek};

export const OMEGA_RATIO_OPTIMAL_MAX = ${spec.omegaRatio.optimalMax};
export const OMEGA_RATIO_ELEVATED_MAX = ${spec.omegaRatio.elevatedMax};
export const OMEGA_RATIO_HIGH_MAX = ${spec.omegaRatio.highMax};
`;
}

function ktFile(): string {
	const rda = spec.rda
		.map(
			(r) =>
				`        RdaEntry("${r.nutrientKey}", "${r.unit}", ${kt(r.rdaMale)}, ${kt(r.rdaFemale)}, "${r.label}"),`
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

const val KCAL_PER_KG_FAT = ${kt(spec.energy.kcalPerKgFat)}
const val KCAL_PER_KG_MUSCLE = ${kt(spec.energy.kcalPerKgMuscle)}
const val DEFAULT_MUSCLE_RATIO = ${spec.energy.defaultMuscleRatio}

const val PLATEAU_THRESHOLD_KG_PER_WEEK = ${spec.tdee.plateauThresholdKgPerWeek}

const val OMEGA_RATIO_OPTIMAL_MAX = ${kt(spec.omegaRatio.optimalMax)}
const val OMEGA_RATIO_ELEVATED_MAX = ${kt(spec.omegaRatio.elevatedMax)}
const val OMEGA_RATIO_HIGH_MAX = ${kt(spec.omegaRatio.highMax)}
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
