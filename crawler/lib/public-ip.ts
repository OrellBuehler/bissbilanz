import { consoleLog, type Logger } from './log';

const IP_URL = 'https://api.ipify.org';

type IpLookupOpts = {
	fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
	timeoutMs?: number;
};

export async function lookupPublicIp(opts: IpLookupOpts = {}): Promise<string> {
	const doFetch = opts.fetchImpl ?? fetch;
	const res = await doFetch(IP_URL, { signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const ip = (await res.text()).trim();
	if (!ip) throw new Error('empty response');
	return ip;
}

export async function logPublicIp(opts: IpLookupOpts & { log?: Logger } = {}): Promise<void> {
	const log = opts.log ?? consoleLog;
	try {
		log(`[crawler] public IP: ${await lookupPublicIp(opts)}`);
	} catch (err) {
		log(
			`[crawler] warning: could not determine the public IP (${err instanceof Error ? err.message : String(err)})`
		);
	}
}
