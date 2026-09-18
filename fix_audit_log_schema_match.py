#!/usr/bin/env python3
"""
Extends the pre-existing (unused) AuditLog model rather than replacing it:
  1. schema.prisma: adds entityType, entityId, before, after to AuditLog
     (keeps existing id/actorId/actor/action/target/createdAt as-is)
  2. audit.service.ts: rewritten to match -- actorId is required (matches
     the existing schema), target is auto-derived from entityType:entityId
  3. New backend/src/routes/audit.routes.ts: GET / (admin-only), with
     optional entityType/actorId filters and pagination
  4. index.ts: mounts the new route at /audit

Idempotent: safe to re-run.
"""
import re
import sys
from pathlib import Path

ROOT = Path.cwd()

def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)

def read(path: Path) -> str:
    if not path.exists():
        fail(f"File not found: {path}")
    return path.read_text(encoding="utf-8")

def write(path: Path, text: str):
    path.write_text(text, encoding="utf-8")
    print(f"[OK] wrote {path}")

# ---------------------------------------------------------------------------
# 1. schema.prisma
# ---------------------------------------------------------------------------
def patch_schema():
    path = ROOT / "backend" / "prisma" / "schema.prisma"
    text = read(path)

    if "entityType" in text and "model AuditLog" in text:
        print("[OK] schema.prisma: AuditLog already has entityType/entityId, skipping")
        return

    old_model = '''model AuditLog {
  id        String   @id @default(uuid())
  actorId   String
  actor     User     @relation("ActorLogs", fields: [actorId], references: [id])
  action    String
  target    String?
  createdAt DateTime @default(now())
}'''
    if old_model not in text:
        fail("Could not find the existing AuditLog model block (exact match). Paste current schema section to re-check.")

    new_model = '''model AuditLog {
  id         String   @id @default(uuid())
  actorId    String
  actor      User     @relation("ActorLogs", fields: [actorId], references: [id])
  action     String
  target     String?
  entityType String?
  entityId   String?
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([actorId])
  @@index([createdAt])
}'''
    text = text.replace(old_model, new_model, 1)
    write(path, text)

# ---------------------------------------------------------------------------
# 2. audit.service.ts (rewrite to match the real schema)
# ---------------------------------------------------------------------------
def rewrite_service():
    path = ROOT / "backend" / "src" / "services" / "audit.service.ts"

    content = '''import { prisma } from '../lib/prisma';

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
'''
    write(path, content)

# ---------------------------------------------------------------------------
# 3. audit.routes.ts
# ---------------------------------------------------------------------------
def create_routes():
    path = ROOT / "backend" / "src" / "routes" / "audit.routes.ts"
    if path.exists():
        print(f"[OK] {path} already exists, skipping")
        return

    content = '''import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Admin: view the audit log (optionally filtered, paginated) ----------
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { entityType, actorId, page, pageSize } = req.query as {
    entityType?: string;
    actorId?: string;
    page?: string;
    pageSize?: string;
  };

  const take = Math.min(Number(pageSize) || 50, 200);
  const skip = ((Number(page) || 1) - 1) * take;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(actorId ? { actorId } : {}),
      },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.count({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(actorId ? { actorId } : {}),
      },
    }),
  ]);

  res.json({ entries, total, page: Number(page) || 1, pageSize: take });
});

export default router;
'''
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, content)

# ---------------------------------------------------------------------------
# 4. index.ts (mount the new route)
# ---------------------------------------------------------------------------
def patch_index():
    path = ROOT / "backend" / "src" / "index.ts"
    text = read(path)

    if "audit.routes" in text:
        print("[OK] index.ts: audit routes already mounted, skipping")
        return

    import_marker = "import lettersRoutes from './routes/letters.routes';"
    if import_marker not in text:
        fail("Could not find the letters.routes import line in index.ts to anchor the audit import near")
    text = text.replace(
        import_marker,
        import_marker + "\nimport auditRoutes from './routes/audit.routes';",
        1,
    )

    mount_marker = "app.use('/letters', lettersRoutes);"
    if mount_marker not in text:
        fail("Could not find the letters route mount line in index.ts")
    text = text.replace(
        mount_marker,
        mount_marker + "\napp.use('/audit', auditRoutes);",
        1,
    )

    write(path, text)

# ---------------------------------------------------------------------------
if __name__ == "__main__":
    patch_schema()
    rewrite_service()
    create_routes()
    patch_index()
    print("[OK] Audit logging foundation (v2, matched to real schema) in place.")
