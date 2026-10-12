import { eq, sql } from 'drizzle-orm';
import { appSettings } from '../schema';
import { writeAudit, type AdminActor, type AdminDb, type AdminDbOrTx } from '../admin/audit';

const CLAUDE_ENABLED_KEY = 'claude_enabled';

export async function getClaudeEnabled(db: AdminDbOrTx): Promise<boolean> {
	const [row] = await db
		.select({ enabled: sql<boolean>`${appSettings.value} = 'true'::jsonb` })
		.from(appSettings)
		.where(eq(appSettings.key, CLAUDE_ENABLED_KEY));
	return row?.enabled === true;
}

export async function setClaudeEnabled(
	db: AdminDb,
	actor: AdminActor,
	enabled: boolean
): Promise<void> {
	await db.transaction(async (tx) => {
		const before = await getClaudeEnabled(tx);
		await tx
			.insert(appSettings)
			.values({ key: CLAUDE_ENABLED_KEY, value: enabled, updatedBy: actor.userId })
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: enabled, updatedBy: actor.userId, updatedAt: sql`now()` }
			});
		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorLabel: actor.label,
			action: 'settings.claude_enabled',
			targetUserId: null,
			before: { enabled: before },
			after: { enabled }
		});
	});
}
