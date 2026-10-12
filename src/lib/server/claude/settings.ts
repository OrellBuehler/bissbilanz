import { eq, sql } from 'drizzle-orm';
import { appSettings } from '../schema';
import { writeAudit, type AdminActor, type AdminDb, type AdminDbOrTx } from '../admin/audit';

const CLAUDE_ENABLED_KEY = 'claude_enabled';

const enabledSql = sql<boolean>`${appSettings.value} = 'true'::jsonb`;

export async function getClaudeEnabled(db: AdminDbOrTx): Promise<boolean> {
	const [row] = await db
		.select({ enabled: enabledSql })
		.from(appSettings)
		.where(eq(appSettings.key, CLAUDE_ENABLED_KEY));
	return row?.enabled === true;
}

export async function setClaudeEnabled(
	db: AdminDb,
	actor: AdminActor,
	enabled: boolean
): Promise<{ changed: boolean }> {
	return db.transaction(async (tx) => {
		// A missing row means off, so seeding it as false changes nothing; it only gives FOR UPDATE a row to lock.
		await tx
			.insert(appSettings)
			.values({ key: CLAUDE_ENABLED_KEY, value: false })
			.onConflictDoNothing();
		const [current] = await tx
			.select({ enabled: enabledSql })
			.from(appSettings)
			.where(eq(appSettings.key, CLAUDE_ENABLED_KEY))
			.for('update');
		const before = current?.enabled === true;
		if (before === enabled) return { changed: false };

		await tx
			.update(appSettings)
			.set({ value: enabled, updatedBy: actor.userId, updatedAt: sql`now()` })
			.where(eq(appSettings.key, CLAUDE_ENABLED_KEY));
		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorLabel: actor.label,
			action: 'settings.claude_enabled',
			targetUserId: null,
			before: { enabled: before },
			after: { enabled }
		});
		return { changed: true };
	});
}
