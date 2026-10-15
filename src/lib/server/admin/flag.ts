import { and, asc, eq, sql } from 'drizzle-orm';
import { users } from '../schema';
import { CLI_ACTOR, writeAudit, type AdminDb } from './audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminFlagUser = { id: string; email: string | null; name: string | null };

export async function resolveUser(db: AdminDb, emailOrId: string): Promise<AdminFlagUser> {
	const needle = emailOrId.trim();
	if (!needle) throw new Error('A user email or id is required');

	const matches = await db
		.select({ id: users.id, email: users.email, name: users.name })
		.from(users)
		.where(
			UUID_RE.test(needle) ? eq(users.id, needle) : sql`lower(${users.email}) = lower(${needle})`
		)
		.limit(10);

	if (matches.length === 0) throw new Error(`No user matching "${needle}"`);
	if (matches.length > 1) {
		const listing = matches.map((u) => `${u.id} (${u.email ?? 'no email'})`).join(', ');
		throw new Error(`"${needle}" matches ${matches.length} users, use the id instead: ${listing}`);
	}
	return matches[0];
}

export async function setAdminFlag(
	db: AdminDb,
	emailOrId: string,
	isAdmin: boolean
): Promise<{ user: AdminFlagUser; changed: boolean }> {
	const user = await resolveUser(db, emailOrId);

	const changed = await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ isAdmin: users.isAdmin })
			.from(users)
			.where(eq(users.id, user.id))
			.for('update');
		if (!current) throw new Error(`User ${user.id} no longer exists`);
		if (current.isAdmin === isAdmin) return false;

		await tx
			.update(users)
			.set({ isAdmin, updatedAt: new Date() })
			.where(and(eq(users.id, user.id), eq(users.isAdmin, current.isAdmin)));
		await writeAudit(tx, {
			actorUserId: CLI_ACTOR.userId,
			actorLabel: CLI_ACTOR.label,
			action: isAdmin ? 'admin.grant' : 'admin.revoke',
			targetUserId: user.id,
			before: { isAdmin: current.isAdmin },
			after: { isAdmin }
		});
		return true;
	});

	return { user, changed };
}

export async function listAdmins(db: AdminDb): Promise<AdminFlagUser[]> {
	return db
		.select({ id: users.id, email: users.email, name: users.name })
		.from(users)
		.where(eq(users.isAdmin, true))
		.orderBy(asc(users.createdAt), asc(users.id));
}
