#!/usr/bin/env node
// Regenerates the App Store provisioning profiles the iOS release job signs
// with, and stores them back as GitHub secrets.
//
// Enabling a capability on an App ID (Sign In with Apple, iCloud, App Groups,
// ...) invalidates every existing profile for it. The release job exports with
// manual signing against profiles kept in secrets, so a stale profile fails the
// "Export IPA" step with:
//
//   Provisioning profile "..." doesn't include the <entitlement> entitlement.
//
// Recreating a profile is the fix: a new one always carries the App ID's
// current capabilities. This does that over the App Store Connect API so it
// needs no Developer portal clicking.
//
// Usage:
//   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=... \
//     node scripts/ios/refresh-provisioning-profiles.mjs [--apply] [--all] [--skip-secrets]
//
//   (no flags)       report which profiles are invalid, change nothing
//   --apply          recreate invalid profiles and update the GitHub secrets
//   --all            also recreate profiles that are still ACTIVE
//   --skip-secrets   recreate profiles but leave the GitHub secrets alone

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TARGETS = [
	{
		bundleId: 'com.bissbilanz.ios',
		profileName: 'Bissbilanz iOS App Store',
		secret: 'IOS_PROFILE_APP_BASE64'
	},
	{
		bundleId: 'com.bissbilanz.ios.widgets',
		profileName: 'Bissbilanz Widgets App Store',
		secret: 'IOS_PROFILE_WIDGET_BASE64'
	},
	{
		bundleId: 'com.bissbilanz.ios.watchkitapp',
		profileName: 'Bissbilanz Watch App Store',
		secret: 'IOS_PROFILE_WATCH_BASE64'
	},
	{
		bundleId: 'com.bissbilanz.ios.watchkitapp.widgets',
		profileName: 'Bissbilanz Watch Widgets App Store',
		secret: 'IOS_PROFILE_WATCH_WIDGET_BASE64'
	}
];

const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');
const skipSecrets = process.argv.includes('--skip-secrets');

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY_PATH) {
	console.error(
		'Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_PATH (the .p8 App Store\n' +
			'Connect API key). The key needs the Admin or App Manager role to write profiles.'
	);
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
	// ES256 wants the raw r||s pair, not OpenSSL's DER wrapping.
	const sig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
	return `${header}.${payload}.${b64url(sig)}`;
}

async function asc(method, endpoint, body) {
	const res = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
		method,
		headers: { Authorization: `Bearer ${bearer()}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status}\n${text}`);
	return text ? JSON.parse(text) : null;
}

const distributionCertId = async () => {
	const { data } = await asc('GET', '/v1/certificates?filter[certificateType]=DISTRIBUTION');
	const usable = data.filter((c) => new Date(c.attributes.expirationDate) > new Date());
	if (usable.length !== 1) {
		throw new Error(
			`expected exactly one unexpired distribution certificate, found ${usable.length}:\n` +
				usable.map((c) => `  ${c.id} ${c.attributes.name}`).join('\n')
		);
	}
	return usable[0].id;
};

const profiles = (await asc('GET', '/v1/profiles?limit=200')).data;
const bundleIds = (await asc('GET', '/v1/bundleIds?limit=200')).data;

const stale = [];
for (const target of TARGETS) {
	const existing = profiles.find((p) => p.attributes.name === target.profileName);
	const state = existing?.attributes.profileState ?? 'MISSING';
	console.log(`${state === 'ACTIVE' ? 'ok     ' : 'STALE  '} ${target.profileName} (${state})`);
	if (state !== 'ACTIVE' || all) stale.push({ ...target, existing });
}

if (!stale.length) {
	console.log('\nAll profiles are ACTIVE; nothing to do.');
	process.exit(0);
}
if (!apply) {
	console.log(`\n${stale.length} profile(s) need recreating. Re-run with --apply to do it.`);
	process.exit(0);
}

const certId = await distributionCertId();
console.log(`\nsigning certificate: ${certId}`);

for (const target of stale) {
	const bundle = bundleIds.find((b) => b.attributes.identifier === target.bundleId);
	if (!bundle) throw new Error(`no registered App ID for ${target.bundleId}`);

	// Apple keeps profile names unique per team, so the old one has to go before
	// a replacement can reuse its name (which ExportOptions.plist references).
	if (target.existing) {
		await asc('DELETE', `/v1/profiles/${target.existing.id}`);
		console.log(`\ndeleted ${target.existing.id} (${target.profileName})`);
	}

	const created = await asc('POST', '/v1/profiles', {
		data: {
			type: 'profiles',
			attributes: { name: target.profileName, profileType: 'IOS_APP_STORE' },
			relationships: {
				bundleId: { data: { id: bundle.id, type: 'bundleIds' } },
				certificates: { data: [{ id: certId, type: 'certificates' }] }
			}
		}
	});
	const attrs = created.data.attributes;
	console.log(
		`created ${created.data.id} state=${attrs.profileState} expires=${attrs.expirationDate}`
	);

	if (skipSecrets) {
		const file = path.join(
			fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-')),
			`${target.secret}.mobileprovision`
		);
		fs.writeFileSync(file, Buffer.from(attrs.profileContent, 'base64'));
		console.log(`  wrote ${file}`);
		console.log(`  base64 -w0 '${file}' | gh secret set ${target.secret}`);
		continue;
	}
	// Re-encode so the secret is single-line base64, which is what the release
	// job's `base64 -d` expects.
	execFileSync('gh', ['secret', 'set', target.secret], {
		input: Buffer.from(attrs.profileContent, 'base64').toString('base64'),
		stdio: ['pipe', 'inherit', 'inherit']
	});
	console.log(`  updated secret ${target.secret}`);
}

console.log('\nDone. Re-run the failed ios-release job to pick the new profiles up.');
