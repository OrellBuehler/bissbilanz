import { eq } from 'drizzle-orm';
import { ApiError } from '../errors';
import { claudeAccess, users } from '../schema';
import { emitClaudeAccessChanged } from '../claude/events';
import { effectiveUserBudgetUsd } from '../claude/usage';
import { requireAdmin } from './guard';
import { writeAudit, type AdminActor, type AdminDb } from './audit';

export type ClaudeAccessPatch = {
	enabled?: boolean;
	monthlyBudgetUsd?: number | null;
	note?: string | null;
};

export type ClaudeAccessView = {
	enabled: boolean;
	monthlyBudgetUsd: number | null;
	effectiveBudgetUsd: number;
	note: string | null;
	grantedAt: string | null;
	updatedAt: string;
};

export function requireAdminActor(locals: App.Locals): AdminActor {
	const userId = requireAdmin(locals);
	return { userId, label: locals.user?.email ?? userId };
}

const snapshot = (row: {
	enabled: boolean;
	monthlyBudgetUsd: number | null;
	note: string | null;
}) => ({
	enabled: row.enabled,
	monthlyBudgetUsd: row.monthlyBudgetUsd,
	note: row.note
});

export async function updateClaudeAccess(
	db: AdminDb,
	actor: AdminActor,
	userId: string,
	patch: ClaudeAccessPatch
): Promise<ClaudeAccessView> {
	const { view, changed } = await db.transaction(async (tx) => {
		const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
		if (!target) throw new ApiError(404, 'Not found');

		// A missing row means access off, so seeding it changes nothing; it only gives FOR UPDATE a row to lock.
		await tx.insert(claudeAccess).values({ userId }).onConflictDoNothing();
		const [current] = await tx
			.select()
			.from(claudeAccess)
			.where(eq(claudeAccess.userId, userId))
			.for('update');

		const before = snapshot(current);
		const after = {
			enabled: patch.enabled ?? current.enabled,
			monthlyBudgetUsd:
				patch.monthlyBudgetUsd === undefined ? current.monthlyBudgetUsd : patch.monthlyBudgetUsd,
			note: patch.note === undefined ? current.note : patch.note?.trim() || null
		};

		if (
			before.enabled === after.enabled &&
			before.monthlyBudgetUsd === after.monthlyBudgetUsd &&
			before.note === after.note
		) {
			return { view: toView(current), changed: false };
		}

		const granting = !before.enabled && after.enabled;
		const [updated] = await tx
			.update(claudeAccess)
			.set({
				...after,
				...(granting ? { grantedBy: actor.userId, grantedAt: new Date() } : {}),
				updatedAt: new Date()
			})
			.where(eq(claudeAccess.userId, userId))
			.returning();

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorLabel: actor.label,
			action: granting
				? 'claude_access.grant'
				: before.enabled && !after.enabled
					? 'claude_access.revoke'
					: 'claude_access.update',
			targetUserId: userId,
			before,
			after
		});

		return { view: toView(updated), changed: true };
	});

	if (changed) emitClaudeAccessChanged({ userId });
	return view;
}

function toView(row: typeof claudeAccess.$inferSelect): ClaudeAccessView {
	return {
		enabled: row.enabled,
		monthlyBudgetUsd: row.monthlyBudgetUsd,
		effectiveBudgetUsd: effectiveUserBudgetUsd(row),
		note: row.note,
		grantedAt: row.grantedAt ? row.grantedAt.toISOString() : null,
		updatedAt: row.updatedAt.toISOString()
	};
}
