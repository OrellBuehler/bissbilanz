import ExcelJS from 'exceljs';
import type { CrawledFood, CrawlStats } from '../../types';
import { newStats, recordDrop } from '../../types';
import { HEADER, blvRowToFood, normalizeHeader, type BlvRow } from './normalize-blv';

export type BlvCrawlOpts = {
	limit?: number;
	stats?: CrawlStats;
	crawledAt?: string;
};

function cellValue(v: ExcelJS.CellValue): unknown {
	if (v && typeof v === 'object') {
		if ('result' in v) return v.result;
		if ('richText' in v) return v.richText.map((t) => t.text).join('');
		if ('text' in v) return v.text;
	}
	return v;
}

const HEADER_SEARCH_ROWS = 10;

export function* readBlvRows(workbook: ExcelJS.Workbook): Generator<BlvRow> {
	for (const sheet of workbook.worksheets) {
		let headerRow = 0;
		let headers: string[] = [];
		for (let r = 1; r <= Math.min(HEADER_SEARCH_ROWS, sheet.rowCount); r++) {
			const cells = (sheet.getRow(r).values as ExcelJS.CellValue[]).slice(1).map(cellValue);
			const normalized = cells.map(normalizeHeader);
			if (normalized.includes(HEADER.name) && normalized.includes(HEADER.category)) {
				headerRow = r;
				headers = normalized;
				break;
			}
		}
		if (headerRow === 0) continue;
		for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
			const cells = (sheet.getRow(r).values as ExcelJS.CellValue[]).slice(1).map(cellValue);
			const row: BlvRow = {};
			headers.forEach((h, i) => {
				if (h && !(h in row)) row[h] = cells[i];
			});
			if (row[HEADER.name] == null) continue;
			yield row;
		}
	}
}

export async function loadBlvWorkbook(source: string | Uint8Array): Promise<ExcelJS.Workbook> {
	const workbook = new ExcelJS.Workbook();
	if (typeof source === 'string') await workbook.xlsx.readFile(source);
	else await workbook.xlsx.load(source as unknown as ExcelJS.Buffer);
	return workbook;
}

export async function* crawlBlv(
	workbook: ExcelJS.Workbook,
	opts: BlvCrawlOpts = {}
): AsyncIterable<CrawledFood> {
	const stats = opts.stats ?? newStats();
	const crawledAt = opts.crawledAt ?? new Date().toISOString();
	for (const row of readBlvRows(workbook)) {
		stats.seen++;
		const r = blvRowToFood(row);
		if (!r.ok) {
			recordDrop(stats, r.reason);
			continue;
		}
		stats.emitted++;
		yield { product: { ...r.food.product, crawledAt }, categories: r.food.categories };
		if (opts.limit && stats.emitted >= opts.limit) return;
	}
}
