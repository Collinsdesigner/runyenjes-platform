import { prisma } from '../lib/prisma';

interface AuditParams {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Records an audit log entry. Deliberately never throws -- a failure to
 * write an audit record must never break the underlying request. Call
 * this *after* the real operation has already succeeded.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        target: `${params.entityType}:${params.entityId}`,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before === undefined ? undefined : (params.before as any),
        after: params.after === undefined ? undefined : (params.after as any),
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
