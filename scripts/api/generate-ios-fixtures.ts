#!/usr/bin/env bun
// Generates example payloads from docs/openapi.json for the response schemas
// the iOS app decodes, so `BissbilanzTests/APIContractDecodingTests.swift` can
// catch a server change that breaks Swift decoding. See CLAUDE.md ("Mobile
// Development") and the operation -> Swift type table in that test file.
//
// For each schema in SCHEMA_NAMES below, emits two fixtures under
// `mobile/iosApp/BissbilanzTests/Fixtures/API/`:
//   <Name>.minimal.json — only required properties; nullable ones are null;
//                         arrays have exactly one minimal element.
//   <Name>.full.json    — every property present with a non-null value;
//                         arrays have exactly one full element.
// Plus, for enums, extra `<Name>.full.enum-<path>-<value>.json` variants:
// each distinct enum (by its value set) gets ONE schema's worth of variants
// covering every value it declares, so a Swift enum missing a case fails
// somewhere without multiplying files across every schema that reuses it.
//
// `manifest.json` lists every generated fixture per schema plus the
// operations (method/path/operationId) that return that schema, so
// `everyManifestSchemaIsMapped` in the Swift test can fail when a fixture
// exists with no corresponding entry in the Swift decode table.
//
// Output is deterministic: fixed sample values, stable per-path UUIDs/dates,
// alphabetically sorted object keys, no timestamps — so `bun run api:check`
// can diff it for staleness like the OpenAPI spec and TS/Kotlin clients.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonSchema = Record<string, any>;

// ---------------------------------------------------------------------------
// The response schemas the iOS app decodes (see BissbilanzAPI.swift and the
// mapping table in APIContractDecodingTests.swift). Order is fixed and
// determines which schema "claims" a shared enum's coverage variants.
// ---------------------------------------------------------------------------
const SCHEMA_NAMES: string[] = [
	'GoalsResponse',
	'GoalsSetResponse',
	'FoodsListResponse',
	'FoodsRecentResponse',
	'FoodResponse',
	'FoodDuplicatesResponse',
	'FoodBrandsResponse',
	'FoodLabelStatsResponse',
	'FoodPackageSummaryResponse',
	'FoodPackagePreviewResponse',
	'FoodPackageImportResult',
	'FoodLabelsSetResponse',
	'EntriesListResponse',
	'EntriesCopyResponse',
	'EntriesRangeResponse',
	'EntryResponse',
	'RecipesListResponse',
	'RecipeResponse',
	'SupplementsListResponse',
	'SupplementResponse',
	'SupplementChecklistResponse',
	'SupplementHistoryResponse',
	'SupplementLogResponse',
	'RemindersListResponse',
	'ReminderResponse',
	'WeightEntriesResponse',
	'WeightEntryResponse',
	'WeightLatestResponse',
	'FastingSessionsResponse',
	'FastingSessionResponse',
	'SleepEntriesResponse',
	'SleepEntryResponse',
	'DailyStatsResponse',
	'WeeklyStatsResponse',
	'MonthlyStatsResponse',
	'MealBreakdownResponse',
	'TopFoodsResponse',
	'StreaksResponse',
	'CalendarResponse',
	'DayPropertiesResponse',
	'DayPropertiesRangeResponse',
	'PreferencesResponse',
	'MealTypesListResponse',
	'MealTypeResponse',
	'FavoritesResponse',
	'AccountResponse',
	'ImageUploadResponse',
	'AiTasksResponse',
	'AiTaskResponse',
	'AiTaskAcknowledgeResponse',
	'AiTaskPhotoResponse',
	'McpStatusResponse',
	'OpenFoodFactsSearchResponse',
	'FoodUsageResponse',
	'RecipeUsageResponse'
];

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SPEC_PATH = join(REPO_ROOT, 'docs/openapi.json');
const FIXTURES_DIR = join(REPO_ROOT, 'mobile/iosApp/BissbilanzTests/Fixtures/API');
const SWIFT_OUT_PATH = join(
	REPO_ROOT,
	'mobile/iosApp/BissbilanzTests/Fixtures/GeneratedAPIFixtures.swift'
);

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));
const schemas: Record<string, JsonSchema> = spec.components.schemas;

function resolveSchema(raw: JsonSchema): JsonSchema {
	if (raw && typeof raw === 'object' && typeof raw.$ref === 'string') {
		const name = raw.$ref.split('/').pop()!;
		const target = schemas[name];
		if (!target) throw new Error(`Unresolvable $ref: ${raw.$ref}`);
		return resolveSchema(target);
	}
	return raw;
}

/** Detects `type: [X, "null"]` and `anyOf: [X, {type:"null"}]` nullable shapes. */
function unwrapNullable(schema: JsonSchema): { inner: JsonSchema; nullable: boolean } {
	if (Array.isArray(schema.type) && schema.type.includes('null')) {
		const rest = schema.type.filter((t: string) => t !== 'null');
		return { inner: { ...schema, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
	}
	for (const key of ['anyOf', 'oneOf'] as const) {
		const branches = schema[key];
		if (Array.isArray(branches)) {
			const nullBranch = branches.find((b: JsonSchema) => b.type === 'null');
			const nonNull = branches.filter((b: JsonSchema) => b.type !== 'null');
			if (nullBranch && nonNull.length === 1) {
				return { inner: nonNull[0], nullable: true };
			}
		}
	}
	return { inner: schema, nullable: false };
}

// ---------------------------------------------------------------------------
// Deterministic sample values
// ---------------------------------------------------------------------------

function hash32(input: string): number {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** A stable, valid-looking UUID (version 4, variant 8) derived from `path`. */
function deterministicUuid(path: string): string {
	let seed = hash32(path || 'root');
	let hex = '';
	while (hex.length < 32) {
		seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
		hex += seed.toString(16).padStart(8, '0');
	}
	hex = hex.slice(0, 32);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const NUMERIC_HINTS: Record<string, number> = {
	calories: 450,
	protein: 30,
	carbs: 50,
	fat: 15,
	fiber: 8,
	servingSize: 100,
	quantity: 1,
	weightKg: 70,
	sortOrder: 0,
	count: 3,
	total: 3,
	totalServings: 4,
	durationMinutes: 420,
	quality: 4,
	targetHours: 16,
	sodium: 200,
	sugar: 10,
	waterMl: 2000,
	logCount: 2,
	lastServings: 1,
	entryCount: 1,
	recipeCount: 0,
	ingredientCount: 0,
	images: 1,
	estimatedBytes: 1000,
	maxBytes: 5000000,
	currentStreak: 3,
	longestStreak: 10,
	activityCalories: 250,
	activityCreditPercent: 100,
	novaGroup: 3,
	acknowledged: 1,
	formatVersion: 1,
	confidence: 0.8
};

function numberFor(propName: string, isInteger: boolean, min?: number, max?: number): number {
	let value = NUMERIC_HINTS[propName] ?? (isInteger ? 3 : 12.5);
	if (typeof min === 'number' && value < min) value = min;
	if (typeof max === 'number' && value > max) value = max;
	return isInteger ? Math.round(value) : value;
}

function sampleString(propName: string): string {
	return `sample-${propName || 'value'}`;
}

// ---------------------------------------------------------------------------
// Value generation
// ---------------------------------------------------------------------------

type Mode = 'minimal' | 'full';

function generateValue(rawSchema: JsonSchema, propName: string, mode: Mode, path: string): any {
	const resolved = resolveSchema(rawSchema);
	const { inner, nullable } = unwrapNullable(resolved);
	if (nullable && mode === 'minimal') return null;
	return generateNonNull(resolveSchema(inner), propName, mode, path);
}

function generateNonNull(schema: JsonSchema, propName: string, mode: Mode, path: string): any {
	if (schema.const !== undefined) return schema.const;
	if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

	const type = schema.type;

	// Free-form string-keyed number map (e.g. `quickNutrients`): no `properties`.
	if (
		type === 'object' &&
		!schema.properties &&
		schema.additionalProperties &&
		typeof schema.additionalProperties === 'object'
	) {
		const valueSchema = schema.additionalProperties as JsonSchema;
		return { sample: generateValue(valueSchema, 'value', mode, `${path}.sample`) };
	}

	if (type === 'object' || schema.properties) {
		return generateObject(schema, mode, path);
	}

	if (type === 'array') {
		const itemSchema = (schema.items as JsonSchema) ?? {};
		return [generateValue(itemSchema, propName, mode, `${path}[0]`)];
	}

	if (type === 'string') {
		if (schema.format === 'uuid') return deterministicUuid(path);
		if (schema.format === 'date-time') return '2024-01-15T12:00:00Z';
		if (schema.format === 'date') return '2024-01-15';
		if (schema.format === 'uri' || schema.format === 'uri-reference')
			return 'https://example.com/sample';
		return sampleString(propName);
	}

	if (type === 'integer') return numberFor(propName, true, schema.minimum, schema.maximum);
	if (type === 'number') return numberFor(propName, false, schema.minimum, schema.maximum);
	if (type === 'boolean') return true;

	if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
		return generateNonNull(resolveSchema(schema.anyOf[0]), propName, mode, path);
	}
	if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
		return generateNonNull(resolveSchema(schema.oneOf[0]), propName, mode, path);
	}

	// Unrecognized/empty schema (e.g. a totally free-form object) — an empty
	// object is always a structurally valid stand-in.
	return {};
}

function generateObject(schema: JsonSchema, mode: Mode, path: string): Record<string, any> {
	const properties: Record<string, JsonSchema> = schema.properties ?? {};
	const required: string[] = Array.isArray(schema.required) ? schema.required : [];
	const keys = mode === 'minimal' ? required : Object.keys(properties);
	const obj: Record<string, any> = {};
	for (const key of keys) {
		const propSchema = properties[key];
		if (!propSchema) continue;
		obj[key] = generateValue(propSchema, key, mode, `${path}.${key}`);
	}
	return obj;
}

function sortKeysDeep(value: any): any {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (value && typeof value === 'object') {
		const sorted: Record<string, any> = {};
		for (const key of Object.keys(value).sort()) {
			sorted[key] = sortKeysDeep(value[key]);
		}
		return sorted;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Enum coverage: for each distinct enum (identified by its value list),
// generate variants of the FIRST schema that contains it, covering every
// value the baseline `full` fixture doesn't already exercise.
// ---------------------------------------------------------------------------

type EnumHit = { path: string; values: any[] };

function collectEnumPaths(
	rawSchema: JsonSchema,
	path: string,
	depth: number,
	acc: EnumHit[]
): void {
	if (depth > 6) return;
	const resolved = resolveSchema(rawSchema);
	const { inner } = unwrapNullable(resolved);
	const schema = resolveSchema(inner);
	if (Array.isArray(schema.enum) && schema.enum.length > 1 && schema.enum.length <= 12) {
		acc.push({ path, values: schema.enum });
	}
	if (schema.type === 'object' && schema.properties) {
		for (const [key, propSchema] of Object.entries(
			schema.properties as Record<string, JsonSchema>
		)) {
			collectEnumPaths(propSchema, `${path}.${key}`, depth + 1, acc);
		}
	} else if (schema.type === 'array' && schema.items) {
		collectEnumPaths(schema.items as JsonSchema, `${path}[0]`, depth + 1, acc);
	}
}

function setAtPath(obj: any, path: string, value: any): void {
	const tokens = path
		.replace(/^\./, '')
		.split(/\.|\[|\]/)
		.filter(Boolean);
	let cur = obj;
	for (let i = 0; i < tokens.length - 1; i++) {
		const t = tokens[i];
		cur = /^\d+$/.test(t) ? cur[Number(t)] : cur[t];
	}
	const last = tokens[tokens.length - 1];
	cur[/^\d+$/.test(last) ? Number(last) : last] = value;
}

function sanitize(segment: string): string {
	return segment.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Operations per schema (for the manifest — informational, and used by the
// Swift test to report which endpoints a schema serves).
// ---------------------------------------------------------------------------

type Operation = { operationId: string; method: string; path: string };

function findOperationsForSchema(schemaName: string): Operation[] {
	const ops: Operation[] = [];
	for (const [p, methods] of Object.entries<any>(spec.paths ?? {})) {
		for (const [m, op] of Object.entries<any>(methods)) {
			if (!op || typeof op !== 'object' || !op.responses) continue;
			const ok = op.responses['200'] ?? op.responses['201'];
			const responseSchema = ok?.content?.['application/json']?.schema;
			if (!responseSchema) continue;
			const refNames: string[] = [];
			if (typeof responseSchema.$ref === 'string') {
				refNames.push(responseSchema.$ref.split('/').pop()!);
			}
			if (Array.isArray(responseSchema.anyOf)) {
				for (const branch of responseSchema.anyOf) {
					if (typeof branch.$ref === 'string') refNames.push(branch.$ref.split('/').pop()!);
				}
			}
			if (refNames.includes(schemaName)) {
				ops.push({ operationId: op.operationId ?? '', method: m.toUpperCase(), path: p });
			}
		}
	}
	return ops;
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

if (existsSync(FIXTURES_DIR)) rmSync(FIXTURES_DIR, { recursive: true, force: true });
mkdirSync(FIXTURES_DIR, { recursive: true });

type ManifestEntry = {
	minimal: string;
	full: string;
	enumVariants: string[];
	operations: Operation[];
};
const manifestSchemas: Record<string, ManifestEntry> = {};
const coveredEnumSignatures = new Set<string>();
const filesWritten: string[] = [];

function writeFixture(filename: string, value: any): void {
	const sorted = sortKeysDeep(value);
	writeFileSync(join(FIXTURES_DIR, filename), JSON.stringify(sorted, null, '\t') + '\n');
	filesWritten.push(filename);
}

for (const name of SCHEMA_NAMES) {
	const schema = schemas[name];
	if (!schema) throw new Error(`Schema "${name}" not found in ${SPEC_PATH}`);

	const minimalValue = generateNonNull(schema, name, 'minimal', '');
	const fullValue = generateNonNull(schema, name, 'full', '');

	const minimalFile = `${name}.minimal.json`;
	const fullFile = `${name}.full.json`;
	writeFixture(minimalFile, minimalValue);
	writeFixture(fullFile, fullValue);

	const enumHits: EnumHit[] = [];
	collectEnumPaths(schema, '', 0, enumHits);

	const enumVariantFiles: string[] = [];
	for (const hit of enumHits) {
		const signature = JSON.stringify(hit.values);
		if (coveredEnumSignatures.has(signature)) continue;
		coveredEnumSignatures.add(signature);
		for (let i = 1; i < hit.values.length; i++) {
			const variant = JSON.parse(JSON.stringify(fullValue));
			setAtPath(variant, hit.path, hit.values[i]);
			const filename = `${name}.full.enum-${sanitize(hit.path)}-${sanitize(String(hit.values[i]))}.json`;
			writeFixture(filename, variant);
			enumVariantFiles.push(filename);
		}
	}

	manifestSchemas[name] = {
		minimal: minimalFile,
		full: fullFile,
		enumVariants: enumVariantFiles,
		operations: findOperationsForSchema(name)
	};
}

const manifest = { schemas: manifestSchemas };
writeFixture('manifest.json', manifest);

// Normalize formatting to match the project's prettier config (tabs, no
// trailing comma) so `bunx prettier --check .` and the pre-commit hook are
// satisfied without a separate manual step.
const prettierResult = Bun.spawnSync(['bunx', 'prettier', '--write', FIXTURES_DIR], {
	cwd: REPO_ROOT,
	stdout: 'inherit',
	stderr: 'inherit'
});
if (prettierResult.exitCode !== 0) {
	throw new Error('prettier --write failed on generated fixtures');
}

// ---------------------------------------------------------------------------
// Embed the (now prettier-formatted) fixture text into a Swift source file so
// the test target never depends on Xcode's bundle-resource copy behavior —
// see the comment in APIContractDecodingTests.swift for why.
// ---------------------------------------------------------------------------

function swiftStringLiteral(text: string): string {
	const escaped = text
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\t/g, '\\t')
		.replace(/\r\n/g, '\n')
		.replace(/\n/g, '\\n');
	return `"${escaped}"`;
}

const swiftEntries: string[] = [];
for (const filename of filesWritten.filter((f) => f !== 'manifest.json')) {
	const key = filename.replace(/\.json$/, '');
	const text = readFileSync(join(FIXTURES_DIR, filename), 'utf-8');
	swiftEntries.push(`        ${swiftStringLiteral(key)}: ${swiftStringLiteral(text)}`);
}
const manifestText = readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf-8');

const swiftSource = `// GENERATED FILE — do not edit by hand.
// Produced by \`bun run api:fixtures:ios\` (scripts/api/generate-ios-fixtures.ts)
// from docs/openapi.json. Regenerate via \`bun run api:generate\` after
// changing an API route or validation schema, then update the mapping table
// in APIContractDecodingTests.swift for any new endpoint.

import Foundation

/// Spec-derived fixture payloads for \`APIContractDecodingTests\`, embedded as
/// Swift string literals rather than loaded as Xcode bundle resources, so the
/// test target has no dependency on the project's resource-copy setup. Each
/// value is byte-identical to the corresponding file committed under
/// \`Fixtures/API/\` (kept on disk for human review and \`git diff\` staleness
/// checks).
enum GeneratedAPIFixtures {
    /// Keyed by file name without the \`.json\` extension, e.g.
    /// "GoalsResponse.minimal" or "FoodsListResponse.full.enum-foods-servingUnit-kg".
    static let json: [String: String] = [
${swiftEntries.join(',\n')}
    ]

    /// Byte-identical to \`Fixtures/API/manifest.json\`.
    static let manifestJSON: String = ${swiftStringLiteral(manifestText)}
}
`;

writeFileSync(SWIFT_OUT_PATH, swiftSource);

console.log(
	`Generated ${filesWritten.length} fixture files (${SCHEMA_NAMES.length} schemas) under ${FIXTURES_DIR}\nand embedded them in ${SWIFT_OUT_PATH}`
);
