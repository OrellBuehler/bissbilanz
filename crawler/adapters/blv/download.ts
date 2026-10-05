const DOWNLOADS_PAGE = 'https://naehrwertdaten.ch/de/downloads/';
const XLSX_LINK = /href=["']([^"']*Schweizer_Nahrwertdatenbank\.xlsx)["']/i;

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export async function resolveBlvXlsxUrl(fetchImpl: FetchImpl = fetch): Promise<string> {
	const res = await fetchImpl(DOWNLOADS_PAGE);
	if (!res.ok) throw new Error(`BLV downloads page: HTTP ${res.status}`);
	const match = XLSX_LINK.exec(await res.text());
	if (!match) throw new Error('BLV downloads page: no Schweizer_Nahrwertdatenbank.xlsx link found');
	return new URL(match[1], DOWNLOADS_PAGE).toString();
}

export async function downloadBlvXlsx(fetchImpl: FetchImpl = fetch): Promise<Uint8Array> {
	const url = await resolveBlvXlsxUrl(fetchImpl);
	console.error(`[blv] downloading ${url}`);
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`BLV xlsx download: HTTP ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}
