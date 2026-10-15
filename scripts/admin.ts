#!/usr/bin/env bun
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/schema';
import { listAdmins, setAdminFlag } from '../src/lib/server/admin/flag';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL environment variable is required');
	process.exit(1);
}
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });

const label = (u: { id: string; email: string | null }) => `${u.email ?? '(no email)'} (${u.id})`;

async function grant(emailOrId: string) {
	const { user, changed } = await setAdminFlag(db, emailOrId, true);
	console.log(changed ? `Granted admin to ${label(user)}` : `${label(user)} is already an admin`);
}

async function revoke(emailOrId: string) {
	const { user, changed } = await setAdminFlag(db, emailOrId, false);
	console.log(changed ? `Revoked admin from ${label(user)}` : `${label(user)} is not an admin`);
}

async function list() {
	const admins = await listAdmins(db);
	if (admins.length === 0) console.log('(no admins)');
	for (const admin of admins) console.log(label(admin));
}

const [cmd, ...args] = process.argv.slice(2);

try {
	if (cmd === 'grant') {
		if (!args[0]) throw new Error('Usage: admin grant <email|id>');
		await grant(args[0]);
	} else if (cmd === 'revoke') {
		if (!args[0]) throw new Error('Usage: admin revoke <email|id>');
		await revoke(args[0]);
	} else if (cmd === 'list') {
		await list();
	} else {
		throw new Error(`Unknown command: ${cmd ?? '(none)'}. Expected: grant|revoke|list`);
	}
	await client.end();
	process.exit(0);
} catch (e) {
	console.error(e instanceof Error ? e.message : String(e));
	await client.end();
	process.exit(1);
}
