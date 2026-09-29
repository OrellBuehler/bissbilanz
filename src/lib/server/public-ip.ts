import { isIPv4 } from 'node:net';

function isPublicIpv4(ip: string): boolean {
	const [a, b, c] = ip.split('.').map(Number);
	if (a === 0 || a === 10 || a === 127) return false;
	if (a === 100 && b >= 64 && b <= 127) return false;
	if (a === 169 && b === 254) return false;
	if (a === 172 && b >= 16 && b <= 31) return false;
	if (a === 192 && b === 168) return false;
	if (a === 192 && b === 0 && c === 0) return false;
	if (a === 198 && (b === 18 || b === 19)) return false;
	if (a >= 224) return false;
	return true;
}

function isPublicIpv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === '::' || lower === '::1') return false;
	if (lower.startsWith('::ffff:')) {
		const tail = lower.slice(7);
		if (tail.includes('.')) return isPublicIpv4(tail);
		// Hex form of an IPv4-mapped address (::ffff:7f00:1): decode the last 32 bits.
		const groups = tail.split(':').map((group) => parseInt(group, 16));
		if (groups.length !== 2 || groups.some(Number.isNaN)) return false;
		const [high, low] = groups;
		return isPublicIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
	}
	// NAT64 (64:ff9b::/96) embeds an IPv4 address the resolver never vetted.
	if (lower.startsWith('64:ff9b:')) return false;
	if (/^f[cd]/.test(lower) || /^fe[89a-f]/.test(lower)) return false;
	return true;
}

/** True only for globally routable unicast addresses (never private, loopback, link-local or reserved). */
export function isPublicIp(ip: string): boolean {
	return isIPv4(ip) ? isPublicIpv4(ip) : isPublicIpv6(ip);
}
