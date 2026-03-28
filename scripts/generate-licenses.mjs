#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

const inputPath = process.argv[2];
if (!inputPath) {
	console.error('Usage: node scripts/generate-licenses.mjs <licenses.json>');
	process.exit(1);
}

const data = JSON.parse(readFileSync(inputPath, 'utf8'));
const lines = ['# Third-Party Licenses\n'];
lines.push('This file lists all third-party dependencies used in production and their licenses.\n');

const entries = Object.entries(data)
	.filter(([k]) => !k.startsWith('bissbilanz@'))
	.sort((a, b) => a[0].localeCompare(b[0]));

const byLicense = {};
for (const [, info] of entries) {
	const lic = info.licenses || 'UNKNOWN';
	byLicense[lic] = (byLicense[lic] || 0) + 1;
}

lines.push('## Summary\n');
lines.push('| License | Count |');
lines.push('|---------|-------|');
for (const [lic, count] of Object.entries(byLicense).sort((a, b) => b[1] - a[1])) {
	lines.push(`| ${lic} | ${count} |`);
}
lines.push('');

lines.push('## Packages\n');
for (const [pkg, info] of entries) {
	lines.push(`### ${pkg}\n`);
	lines.push(`- **License:** ${info.licenses || 'UNKNOWN'}`);
	if (info.repository) lines.push(`- **Repository:** ${info.repository}`);
	if (info.publisher) lines.push(`- **Publisher:** ${info.publisher}`);
	const text = (info.licenseText || '').trim();
	if (text.length > 0 && text.length < 5000) {
		lines.push('');
		lines.push('<details><summary>License Text</summary>\n');
		lines.push('```');
		lines.push(text);
		lines.push('```\n');
		lines.push('</details>');
	}
	lines.push('');
}

writeFileSync('THIRD_PARTY_LICENSES.md', lines.join('\n'));
console.log(`Generated THIRD_PARTY_LICENSES.md (${entries.length} packages)`);
