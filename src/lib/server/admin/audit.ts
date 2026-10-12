import type { getDB } from '../db';
import { adminAuditLog, type AdminAuditAction } from '../schema';

export type AdminDb = ReturnType<typeof getDB>;
export type AdminTx = Parameters<Parameters<AdminDb['transaction']>[0]>[0];
export type AdminDbOrTx = AdminDb | AdminTx;

export type AdminActor = { userId: string | null; label: string };

export const CLI_ACTOR: AdminActor = { userId: null, label: 'cli' };

export type AuditEntry = {
	actorUserId: string | null;
	actorLabel: string;
	action: AdminAuditAction;
	targetUserId: string | null;
	before: unknown;
	after: unknown;
};

export async function writeAudit(tx: AdminDbOrTx, entry: AuditEntry): Promise<void> {
	await tx.insert(adminAuditLog).values({
		actorUserId: entry.actorUserId,
		actorLabel: entry.actorLabel,
		action: entry.action,
		targetUserId: entry.targetUserId,
		before: entry.before ?? null,
		after: entry.after ?? null
	});
}
