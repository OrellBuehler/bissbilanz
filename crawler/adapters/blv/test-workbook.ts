import ExcelJS from 'exceljs';
import { HEADER, NUTRIENT_HEADERS } from './normalize-blv';

const META = [
	'ID',
	'ID V 4.0',
	'ID SwissFIR',
	'Name',
	'Synonyme',
	'Kategorie',
	'Dichte',
	'Bezugseinheit'
];
const VALUE_HEADERS = [
	HEADER.kj,
	HEADER.kcal,
	HEADER.fat,
	HEADER.carbs,
	HEADER.fiber,
	HEADER.protein,
	HEADER.linoleic,
	HEADER.alphaLinolenic,
	HEADER.epa,
	HEADER.dha,
	...Object.values(NUTRIENT_HEADERS)
];

export type FixtureRow = Record<string, string | number | null>;

/** A workbook shaped like the BLV download: title row, blank row, header row, value/derivation/source triples. */
export async function buildBlvWorkbookBytes(rows: FixtureRow[]): Promise<Uint8Array> {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Generische Lebensmittel');
	ws.addRow(['Schweizer Nährwertdatenbank – Generische Lebensmittel V 7.1 (01.07.2026)']);
	ws.addRow([]);
	const header = [...META];
	for (const h of VALUE_HEADERS) header.push(h, 'Herleitung des Wertes', 'Quelle');
	header.push('Geänderter Eintrag');
	ws.addRow(header);
	for (const row of rows) {
		const cells: (string | number | null)[] = META.map((h) => row[h] ?? null);
		for (const h of VALUE_HEADERS) cells.push(row[h] ?? 'k.A.', '-', null);
		cells.push('Nein');
		ws.addRow(cells);
	}
	wb.addWorksheet('Quellen').addRow(['Nr', 'Quelle']);
	return new Uint8Array(await wb.xlsx.writeBuffer());
}

export const APPLE: FixtureRow = {
	ID: 1001,
	Name: 'Apfel, roh',
	Kategorie: 'Früchte/Früchte frisch',
	Bezugseinheit: 'pro 100g essbarer Anteil',
	[HEADER.kj]: 218,
	[HEADER.kcal]: 52,
	[HEADER.fat]: 0.3,
	[HEADER.carbs]: 11.4,
	[HEADER.fiber]: 2.1,
	[HEADER.protein]: 0.3,
	[NUTRIENT_HEADERS.sugar!]: 10.4,
	[NUTRIENT_HEADERS.potassium!]: 120,
	[NUTRIENT_HEADERS.vitaminC!]: 4.6,
	[NUTRIENT_HEADERS.vitaminB9!]: 5.1,
	[NUTRIENT_HEADERS.salt!]: 'Sp.',
	[NUTRIENT_HEADERS.zinc!]: '<0.1',
	[HEADER.alphaLinolenic]: 0.01,
	[HEADER.epa]: 0.002,
	[HEADER.linoleic]: 0.05
};

export const MILK_KJ_ONLY: FixtureRow = {
	ID: 1002,
	Name: 'Vollmilch',
	Kategorie: 'Milch und Milchprodukte/Milch;Alkoholfreie Getränke/Milchgetränke',
	[HEADER.kj]: 284,
	[HEADER.fat]: 4,
	[HEADER.carbs]: 4.7,
	[HEADER.fiber]: 0,
	[HEADER.protein]: 3.2
};

export const NO_PROTEIN: FixtureRow = {
	ID: 1003,
	Name: 'Unvollständig',
	Kategorie: 'Verschiedenes/Salz, Gewürze und Aromen',
	[HEADER.kcal]: 10,
	[HEADER.fat]: 0,
	[HEADER.carbs]: 0,
	[HEADER.fiber]: 0
};
