#!/usr/bin/env python3
"""
Adds the audit logging foundation:
  1. schema.prisma: new `AuditLog` model + reverse relation on `User`
  2. backend/src/services/audit.service.ts: a small `logAudit()` helper,
     safe to call from any route (never throws, never blocks the request
     if logging itself fails)

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

    if "model AuditLog" in text:
        print("[OK] schema.prisma: AuditLog model already present, skipping")
        return

    model = '''
model AuditLog {
  id         String   @id @default(uuid())
  actorId    String?
  actor      User?    @relation(fields: [actorId], references: [id])
  action     String   // e.g. "CREATE_PAYMENT", "UPDATE_GRADE", "DELETE_USER"
  entityType String   // e.g. "Invoice", "FeePayment", "ExamResult", "User"
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([actorId])
  @@index([createdAt])
}
'''
    text = text.rstrip("\n") + "\n" + model

    # Add the reverse relation to User so Prisma's schema stays consistent.
    if "auditLogs" not in text:
        pattern = re.compile(r"(model\s+User\s*\{)(.*?)(\n\})", re.DOTALL)
        m = pattern.search(text)
        if not m:
            fail("Could not locate `model User { ... }` block to add the auditLogs relation")
        insertion = "\n  auditLogs AuditLog[]"
        new_block = m.group(1) + m.group(2) + insertion + m.group(3)
        text = text[: m.start()] + new_block + text[m.end():]

    write(path, text)

# ---------------------------------------------------------------------------
# 2. audit.service.ts
# ---------------------------------------------------------------------------
def create_service():
    path = ROOT / "backend" / "src" / "services" / "audit.service.ts"
    if path.exists():
        print(f"[OK] {path} already exists, skipping")
        return

    content = '''import { prisma } from '../lib/prisma';

interface AuditParams {
  actorId: string | null;
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
    path.parent.mkdir(parents=True, exist_ok=True)
    write(path, content)

# ---------------------------------------------------------------------------
if __name__ == "__main__":
    patch_schema()
    create_service()
    print("[OK] Audit logging foundation in place.")
