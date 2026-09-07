export type CsvIssue = { row: number; message: string };

export type WeightImportRow = {
	entryDate: string;
	weightKg: number;
	notes: string | null;
};

export type SleepImportRow = {
	entryDate: string;
	durationMinutes: number;
	quality: number;
	bedtime: string | null;
	wakeTime: string | null;
	notes: string | null;
};

export type CsvParseResult<T> = { rows: T[]; issues: CsvIssue[] };

export const DEFAULT_SLEEP_QUALITY = 7;

const DELIMITERS = [',', ';', '\t'] as const;

function detectDelimiter(text: string): string {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
	let best = ',';
	let bestCount = -1;
	for (const delimiter of DELIMITERS) {
		const count = firstLine.split(delimiter).length - 1;
		if (count > bestCount) {
			best = delimiter;
			bestCount = count;
		}
	}
	return best;
}

/** RFC 4180-ish reader: quoted fields, doubled quotes, CR/LF inside quotes. */
export function parseCsvRows(input: string): string[][] {
	const text = input.replace(/^\uFEFF/, '');
	const delimiter = detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let hadField = false;

	const endField = () => {
		row.push(field.trim());
		field = '';
		hadField = false;
	};
	const endRow = () => {
		endField();
		if (row.some((cell) => cell !== '')) rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"' && !hadField) {
			quoted = true;
			hadField = true;
		} else if (char === delimiter) {
			endField();
		} else if (char === '\n') {
			endRow();
		} else if (char === '\r') {
			// handled by the following \n
		} else {
			field += char;
			hadField = true;
		}
	}
	if (field !== '' || row.length > 0) endRow();

	return rows;
}

const normalizeHeader = (header: string) =>
	header
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\s_\-.]+/g, '');

function headerIndex(headers: string[], aliases: string[]): number {
	const normalized = headers.map(normalizeHeader);
	for (const alias of aliases) {
		const index = normalized.indexOf(alias);
		if (index !== -1) return index;
	}
	return -1;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

export function parseDate(value: string): string | null {
	const trimmed = value.trim();
	if (ISO_DATE.test(trimmed)) {
		const date = new Date(`${trimmed}T00:00:00Z`);
		return Number.isNaN(date.getTime()) ? null : trimmed;
	}
	// dd.mm.yyyy and dd/mm/yyyy, the two forms spreadsheets produce here
	const match = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
	if (!match) return null;
	const [, day, month, year] = match;
	const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
	return ISO_DATE.test(iso) ? iso : null;
}

export function parseNumber(value: string): number | null {
	const trimmed = value.trim().replace(/\s/g, '');
	if (trimmed === '') return null;
	// "75,5" is a European decimal comma; in "1,234.5" the comma groups thousands
	const normalized = trimmed.includes('.') ? trimmed.replace(/,/g, '') : trimmed.replace(',', '.');
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Either a wall-clock 'HH:MM' or a full ISO-8601 instant; both are kept verbatim. */
export function parseTimeCell(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const time = trimmed.match(TIME_OF_DAY);
	if (time) {
		const hours = Number(time[1]);
		const minutes = Number(time[2]);
		if (hours > 23 || minutes > 59) return null;
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
	}
	const date = new Date(trimmed);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const isInstant = (value: string): boolean => value.includes('T');

const timeToMinutes = (value: string): number | null => {
	const match = value.match(TIME_OF_DAY);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
};

/** '7:30' → 450, '7.5' → 450, '450' with `asMinutes` → 450. */
export function parseDuration(value: string, asMinutes: boolean): number | null {
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const clock = timeToMinutes(trimmed);
	if (clock !== null) return clock;
	const parsed = parseNumber(trimmed);
	if (parsed === null) return null;
	return Math.round(asMinutes ? parsed : parsed * 60);
}

const notesOf = (cells: string[], index: number): string | null => {
	if (index === -1) return null;
	const value = (cells[index] ?? '').trim();
	return value === '' ? null : value.slice(0, 2000);
};

export function parseWeightCsv(text: string): CsvParseResult<WeightImportRow> {
	const table = parseCsvRows(text);
	const issues: CsvIssue[] = [];
	if (table.length === 0) {
		return { rows: [], issues: [{ row: 0, message: 'The file is empty' }] };
	}

	const [headers, ...body] = table;
	const dateIndex = headerIndex(headers, ['date', 'datum', 'day', 'entrydate']);
	const weightIndex = headerIndex(headers, ['weightkg', 'weight', 'kg', 'gewicht', 'gewichtkg']);
	const notesIndex = headerIndex(headers, ['notes', 'note', 'notiz', 'notizen', 'comment']);

	if (dateIndex === -1 || weightIndex === -1) {
		return {
			rows: [],
			issues: [{ row: 1, message: 'Missing required columns: date and weight (kg)' }]
		};
	}

	const rows: WeightImportRow[] = [];
	const seen = new Set<string>();
	body.forEach((cells, index) => {
		const rowNumber = index + 2;
		const entryDate = parseDate(cells[dateIndex] ?? '');
		if (!entryDate) {
			issues.push({ row: rowNumber, message: `Invalid date "${cells[dateIndex] ?? ''}"` });
			return;
		}
		const weightKg = parseNumber(cells[weightIndex] ?? '');
		if (weightKg === null || weightKg <= 0 || weightKg > 500) {
			issues.push({ row: rowNumber, message: `Invalid weight "${cells[weightIndex] ?? ''}"` });
			return;
		}
		if (seen.has(entryDate)) {
			issues.push({ row: rowNumber, message: `Duplicate date ${entryDate} in the file` });
			return;
		}
		seen.add(entryDate);
		rows.push({ entryDate, weightKg, notes: notesOf(cells, notesIndex) });
	});

	return { rows, issues };
}

export function parseSleepCsv(text: string): CsvParseResult<SleepImportRow> {
	const table = parseCsvRows(text);
	const issues: CsvIssue[] = [];
	if (table.length === 0) {
		return { rows: [], issues: [{ row: 0, message: 'The file is empty' }] };
	}

	const [headers, ...body] = table;
	const dateIndex = headerIndex(headers, ['date', 'datum', 'day', 'entrydate']);
	const durationMinutesIndex = headerIndex(headers, ['durationminutes', 'minutes', 'dauerminuten']);
	const durationIndex = headerIndex(headers, ['duration', 'dauer', 'hours', 'stunden']);
	const bedtimeIndex = headerIndex(headers, ['bedtime', 'sleepstart', 'start', 'zubettzeit']);
	const wakeIndex = headerIndex(headers, [
		'waketime',
		'wakeup',
		'wakeuptime',
		'end',
		'aufstehzeit'
	]);
	const qualityIndex = headerIndex(headers, ['quality', 'qualitat', 'bewertung']);
	const notesIndex = headerIndex(headers, ['notes', 'note', 'notiz', 'notizen', 'comment']);

	if (dateIndex === -1) {
		return { rows: [], issues: [{ row: 1, message: 'Missing required column: date' }] };
	}
	if (
		durationMinutesIndex === -1 &&
		durationIndex === -1 &&
		(bedtimeIndex === -1 || wakeIndex === -1)
	) {
		return {
			rows: [],
			issues: [
				{ row: 1, message: 'Missing required columns: duration, or both bedtime and wake time' }
			]
		};
	}

	const rows: SleepImportRow[] = [];
	const seen = new Set<string>();
	body.forEach((cells, index) => {
		const rowNumber = index + 2;
		const entryDate = parseDate(cells[dateIndex] ?? '');
		if (!entryDate) {
			issues.push({ row: rowNumber, message: `Invalid date "${cells[dateIndex] ?? ''}"` });
			return;
		}

		const bedtimeCell = bedtimeIndex === -1 ? '' : (cells[bedtimeIndex] ?? '');
		const wakeCell = wakeIndex === -1 ? '' : (cells[wakeIndex] ?? '');
		const bedtime = parseTimeCell(bedtimeCell);
		const wakeTime = parseTimeCell(wakeCell);
		if (bedtimeCell.trim() !== '' && bedtime === null) {
			issues.push({ row: rowNumber, message: `Invalid bedtime "${bedtimeCell}"` });
			return;
		}
		if (wakeCell.trim() !== '' && wakeTime === null) {
			issues.push({ row: rowNumber, message: `Invalid wake time "${wakeCell}"` });
			return;
		}

		let durationMinutes: number | null = null;
		if (durationMinutesIndex !== -1) {
			durationMinutes = parseDuration(cells[durationMinutesIndex] ?? '', true);
		}
		if (durationMinutes === null && durationIndex !== -1) {
			durationMinutes = parseDuration(cells[durationIndex] ?? '', false);
		}
		if (durationMinutes === null && bedtime && wakeTime) {
			durationMinutes = durationBetween(bedtime, wakeTime);
		}
		if (durationMinutes === null || durationMinutes <= 0 || durationMinutes > 1440) {
			issues.push({ row: rowNumber, message: 'Missing or invalid sleep duration' });
			return;
		}

		let quality = DEFAULT_SLEEP_QUALITY;
		if (qualityIndex !== -1) {
			const raw = (cells[qualityIndex] ?? '').trim();
			if (raw !== '') {
				const parsed = parseNumber(raw);
				if (parsed === null || parsed < 1 || parsed > 10) {
					issues.push({ row: rowNumber, message: `Invalid quality "${raw}" (expected 1-10)` });
					return;
				}
				quality = parsed;
			}
		}

		if (seen.has(entryDate)) {
			issues.push({ row: rowNumber, message: `Duplicate date ${entryDate} in the file` });
			return;
		}
		seen.add(entryDate);

		rows.push({
			entryDate,
			durationMinutes: Math.round(durationMinutes),
			quality,
			bedtime,
			wakeTime,
			notes: notesOf(cells, notesIndex)
		});
	});

	return { rows, issues };
}

/** Minutes between two times; wall-clock pairs roll the wake time to the next day. */
export function durationBetween(bedtime: string, wakeTime: string): number | null {
	if (isInstant(bedtime) !== isInstant(wakeTime)) return null;
	if (isInstant(bedtime)) {
		const diff = new Date(wakeTime).getTime() - new Date(bedtime).getTime();
		return diff > 0 ? Math.round(diff / 60_000) : null;
	}
	const start = timeToMinutes(bedtime);
	const end = timeToMinutes(wakeTime);
	if (start === null || end === null) return null;
	return end > start ? end - start : end + 1440 - start;
}
