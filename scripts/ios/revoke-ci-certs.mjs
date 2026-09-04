#!/usr/bin/env node
// Revokes the "Apple Development: Created via API" certificates that the
// iOS release job's cloud signing mints one-per-run. They pile up until the
// account hits Apple's certificate cap and Archive fails with
// "Your account has reached the maximum number of certificates".
//
// Usage:
//   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=... \
//     node scripts/ios/revoke-ci-certs.mjs [--apply] [--keep-newest]
//
//   (no flags)      list certificates and mark which would be revoked
//   --apply         revoke them
//   --keep-newest   leave the most recently minted API cert alone (use while a
//                   release run is in progress)
//
// Only DEVELOPMENT certs whose display name is "Created via API" are ever
// touched; the distribution cert and personal dev certs are always kept.

import crypto from 'node:crypto';
import fs from 'node:fs';

const apply = process.argv.includes('--apply');
const keepNewest = process.argv.includes('--keep-newest');

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY_PATH) {
	console.error('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_PATH.');
	process.exit(1);
}
const privateKey = fs.readFileSync(ASC_PRIVATE_KEY_PATH, 'utf8');

const b64url = (buf) =>
	Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function bearer() {
	const header = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
	const now = Math.floor(Date.now() / 1000);
	const payload = b64url(
		JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
	);
	const signer = crypto.createSign('SHA256');
	signer.update(`${header}.${payload}`);
	const sig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
	return `${header}.${payload}.${b64url(sig)}`;
}

async function asc(method, endpoint) {
	const res = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
		method,
		headers: { Authorization: `Bearer ${bearer()}` }
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status}\n${text}`);
	return text ? JSON.parse(text) : null;
}

const { data } = await asc('GET', '/v1/certificates?limit=200');
const isCiCert = (c) =>
	c.attributes.certificateType === 'DEVELOPMENT' && c.attributes.displayName === 'Created via API';

const ci = data
	.filter(isCiCert)
	.sort((a, b) => a.attributes.expirationDate.localeCompare(b.attributes.expirationDate));
const targets = keepNewest ? ci.slice(0, -1) : ci;
const targetIds = new Set(targets.map((c) => c.id));

for (const c of data) {
	const a = c.attributes;
	const mark = targetIds.has(c.id) ? (apply ? 'REVOKE' : 'would revoke') : 'keep';
	console.log(
		`${mark.padEnd(12)} ${c.id} ${a.certificateType.padEnd(12)} "${a.name}" exp ${a.expirationDate.slice(0, 10)}`
	);
}

if (!apply) {
	console.log(`\n${targets.length} of ${data.length} would be revoked. Re-run with --apply.`);
	process.exit(0);
}

for (const c of targets) {
	await asc('DELETE', `/v1/certificates/${c.id}`);
	console.log(`revoked ${c.id}`);
}
const after = await asc('GET', '/v1/certificates?limit=200');
console.log(`\n${after.data.length} certificates remain.`);
