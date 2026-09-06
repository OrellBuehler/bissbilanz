import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';
import { ApiError } from '../../src/lib/server/errors';

let parseCalls: Array<{ fileName: string; timeZone: string; format?: string }> = [];
let runCalls: Array<{ mode: string }> = [];
let parseError: unknown = null;

vi.mock('$lib/server/preferences', () => ({
	getUserTimeZone: async () => 'Europe/Zurich'
}));

vi.mock('$lib/server/import', () => ({
	MAX_IMPORT_BYTES: 20 * 1024 * 1024,
	parseImportFile: async (file: File, timeZone: string, format?: string) => {
		if (parseError) throw parseError;
		parseCalls.push({ fileName: file.name, timeZone, format });
		return { format: format ?? 'weight-csv', data: {}, issues: [] };
	},
	runImport: async (_userId: string, parsed: { format: string }, mode: string) => {
		runCalls.push({ mode });
		return {
			mode,
			format: parsed.format,
			totalRows: 2,
			imported: mode === 'commit' ? 2 : 0,
			skipped: 0,
			sections: [{ name: 'weight', toImport: 2, skipped: 0 }],
			samples: ['2026-01-01 — 80 kg'],
			issues: []
		};
	}
}));

const importModule = await import('../../src/routes/api/account/import/+server');

const csvFile = (content = 'date,weight_kg\n2026-01-01,80\n') =>
	new File([content], 'weight.csv', { type: 'text/csv' });

function eventWithFile(options: {
	user?: typeof TEST_USER | null;
	file?: File | null;
	mode?: string;
	format?: string;
}) {
	const { user = TEST_USER, file = csvFile(), mode, format } = options;
	const body = new FormData();
	if (file) body.append('file', file);
	if (mode !== undefined) body.append('mode', mode);
	if (format !== undefined) body.append('format', format);

	const event = createMockEvent({ user });
	return {
		...event,
		request: new Request('http://localhost:5173/api/account/import', {
			method: 'POST',
			body
		})
	} as typeof event;
}

describe('POST /api/account/import', () => {
	beforeEach(() => {
		parseCalls = [];
		runCalls = [];
		parseError = null;
	});

	test('returns 401 when not authenticated', async () => {
		const response = await importModule.POST(eventWithFile({ user: null }));
		expect(response.status).toBe(401);
		expect((await response.json()).error).toBe('Unauthorized');
	});

	test('returns 400 without a file', async () => {
		const response = await importModule.POST(eventWithFile({ file: null }));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Missing import file');
	});

	test('previews by default without importing', async () => {
		const response = await importModule.POST(eventWithFile({}));
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(runCalls).toEqual([{ mode: 'preview' }]);
		expect(data.imported).toBe(0);
		expect(data.sections[0].toImport).toBe(2);
	});

	test('commits when asked and passes the user timezone through', async () => {
		const response = await importModule.POST(eventWithFile({ mode: 'commit' }));
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(runCalls).toEqual([{ mode: 'commit' }]);
		expect(data.imported).toBe(2);
		expect(parseCalls[0].timeZone).toBe('Europe/Zurich');
	});

	test('forwards an explicit format hint', async () => {
		await importModule.POST(eventWithFile({ format: 'sleep-csv' }));
		expect(parseCalls[0].format).toBe('sleep-csv');
	});

	test('rejects an unknown mode and an unknown format', async () => {
		const badMode = await importModule.POST(eventWithFile({ mode: 'wipe' }));
		expect(badMode.status).toBe(400);
		expect((await badMode.json()).error).toBe('Invalid import mode');

		const badFormat = await importModule.POST(eventWithFile({ format: 'xlsx' }));
		expect(badFormat.status).toBe(400);
		expect((await badFormat.json()).error).toBe('Invalid import format');
	});

	test('surfaces a parse failure as a 400', async () => {
		parseError = new ApiError(400, 'The file is empty');
		const response = await importModule.POST(eventWithFile({}));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('The file is empty');
	});
});
