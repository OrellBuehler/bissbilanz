import { and, eq } from 'drizzle-orm';
import { getDB, identities, users } from './db';
import type { ProviderId, ProviderProfile } from './auth-providers';
import type { User } from './db';

/**
 * Only claims the provider actually returned are written back. Providers differ in
 * what they hand over (Apple sends no picture and the name only once), so
 * blindly writing every field would let one provider wipe data another supplied.
 */
function profileUpdates(profile: ProviderProfile) {
	const updates: Partial<Pick<User, 'email' | 'name' | 'avatarUrl'>> = {};
	if (profile.email !== undefined) updates.email = profile.email;
	if (profile.name !== undefined) updates.name = profile.name;
	if (profile.avatarUrl !== undefined) updates.avatarUrl = profile.avatarUrl;
	return updates;
}

export class IdentityConflictError extends Error {
	constructor() {
		super('This account is already connected to another user');
		this.name = 'IdentityConflictError';
	}
}

export class LastIdentityError extends Error {
	constructor() {
		super('Cannot disconnect the last sign-in method');
		this.name = 'LastIdentityError';
	}
}

export async function findUserByIdentity(
	provider: ProviderId,
	subject: string
): Promise<User | undefined> {
	const db = getDB();
	const [row] = await db
		.select({ user: users })
		.from(identities)
		.innerJoin(users, eq(users.id, identities.userId))
		.where(and(eq(identities.provider, provider), eq(identities.subject, subject)));
	return row?.user;
}

export async function findOrCreateUserByIdentity(
	provider: ProviderId,
	profile: ProviderProfile,
	locale: string
): Promise<User> {
	const db = getDB();

	const existing = await findUserByIdentity(provider, profile.sub);
	if (existing) {
		const [updated] = await db
			.update(users)
			.set({ ...profileUpdates(profile), updatedAt: new Date() })
			.where(eq(users.id, existing.id))
			.returning();
		if (profile.email !== undefined) {
			await db
				.update(identities)
				.set({ email: profile.email })
				.where(and(eq(identities.provider, provider), eq(identities.subject, profile.sub)));
		}
		return updated;
	}

	return db.transaction(async (tx) => {
		// Adopt pre-identities accounts whose backfill did not reach them.
		let user: User | undefined;
		if (provider === 'infomaniak') {
			[user] = await tx.select().from(users).where(eq(users.infomaniakSub, profile.sub));
		}

		if (user) {
			[user] = await tx
				.update(users)
				.set({ ...profileUpdates(profile), updatedAt: new Date() })
				.where(eq(users.id, user.id))
				.returning();
		} else {
			[user] = await tx
				.insert(users)
				.values({
					infomaniakSub: provider === 'infomaniak' ? profile.sub : null,
					email: profile.email ?? null,
					name: profile.name ?? null,
					avatarUrl: profile.avatarUrl ?? null,
					locale
				})
				.returning();
		}

		await tx.insert(identities).values({
			userId: user.id,
			provider,
			subject: profile.sub,
			email: profile.email ?? null
		});

		return user;
	});
}

export async function listIdentities(userId: string) {
	const db = getDB();
	return db.select().from(identities).where(eq(identities.userId, userId));
}

export async function linkIdentity(
	userId: string,
	provider: ProviderId,
	profile: ProviderProfile
): Promise<void> {
	const db = getDB();
	const owner = await findUserByIdentity(provider, profile.sub);
	if (owner) {
		if (owner.id === userId) return;
		throw new IdentityConflictError();
	}

	await db.insert(identities).values({
		userId,
		provider,
		subject: profile.sub,
		email: profile.email ?? null
	});
}

export async function unlinkIdentity(userId: string, identityId: string): Promise<void> {
	const db = getDB();
	await db.transaction(async (tx) => {
		const owned = await tx.select().from(identities).where(eq(identities.userId, userId));
		const target = owned.find((identity) => identity.id === identityId);
		if (!target) return;
		if (owned.length <= 1) throw new LastIdentityError();

		await tx.delete(identities).where(eq(identities.id, identityId));
		// Keep the legacy column consistent so it cannot resurrect a removed link.
		if (target.provider === 'infomaniak') {
			await tx.update(users).set({ infomaniakSub: null }).where(eq(users.id, userId));
		}
	});
}
