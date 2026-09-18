#!/usr/bin/env python3
"""
Wires logAudit() calls into the ~17 high-stakes mutating routes agreed on:
grades/results, finance, letters, documents, user/role changes, deletions.

Also fixes a real bug found along the way: admin.routes.ts defined
POST /programs/:id/fee TWICE. Express only ever matches the first
registration, so the second (more complete) definition -- which records
`setBy` -- was dead code. This script removes the broken first definition
and adds audit logging to the one that actually runs.

Each file gets:
  import { logAudit } from '../services/audit.service';
added once, anchored on the existing `requireAuth, requireRole` import
line common to all six files.

Idempotent: every insertion is guarded by checking whether that specific
action string already appears in the file before touching it.
"""
import sys
from pathlib import Path

ROOT = Path.cwd()
IMPORT_ANCHOR = "import { requireAuth, requireRole } from '../middleware/auth';"
IMPORT_LINE = "\nimport { logAudit } from '../services/audit.service';"

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

def ensure_import(text: str, path: Path) -> str:
    if "logAudit" in text and "import { logAudit }" in text:
        return text
    if IMPORT_ANCHOR not in text:
        fail(f"Could not find the requireAuth/requireRole import anchor in {path.name}")
    return text.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORT_LINE, 1)

def apply(text: str, path: Path, marker: str, old: str, new: str) -> str:
    """Replace old->new once, guarded by `marker` already being present (idempotent)."""
    if marker in text:
        print(f"[OK] {path.name}: '{marker}' already present, skipping that site")
        return text
    if old not in text:
        fail(f"{path.name}: could not find expected block for '{marker}'")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# finance.routes.ts
# ---------------------------------------------------------------------------
def patch_finance():
    path = ROOT / "backend" / "src" / "routes" / "finance.routes.ts"
    text = read(path)
    text = ensure_import(text, path)

    text = apply(
        text, path, "'CREATE_INVOICE'",
        """  const invoice = await prisma.invoice.create({
    data: {
      studentId,
      termId,
      description,
      amount,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  res.status(201).json(invoice);""",
        """  const invoice = await prisma.invoice.create({
    data: {
      studentId,
      termId,
      description,
      amount,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'CREATE_INVOICE',
    entityType: 'Invoice',
    entityId: invoice.id,
    after: invoice,
  });

  res.status(201).json(invoice);""",
    )

    text = apply(
        text, path, "'RECORD_PAYMENT'",
        """    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

    res.status(201).json(payment);""",
        """    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

    await logAudit({
      actorId: req.user!.userId,
      action: 'RECORD_PAYMENT',
      entityType: 'FeePayment',
      entityId: payment.id,
      after: { ...payment, newInvoiceStatus: status },
    });

    res.status(201).json(payment);""",
    )

    write(path, text)

# ---------------------------------------------------------------------------
# examinations.routes.ts
# ---------------------------------------------------------------------------
def patch_examinations():
    path = ROOT / "backend" / "src" / "routes" / "examinations.routes.ts"
    text = read(path)
    text = ensure_import(text, path)

    text = apply(
        text, path, "'RECORD_EXAM_RESULT'",
        """    const result = await prisma.examResult.upsert({
      where: { examId_studentId: { examId, studentId } },
      update: { score, grade: grade || null, remarks: remarks || null, recordedById: req.user!.userId },
      create: {
        examId,
        studentId,
        score,
        grade: grade || null,
        remarks: remarks || null,
        recordedById: req.user!.userId,
      },
    });

    res.status(201).json(result);""",
        """    const result = await prisma.examResult.upsert({
      where: { examId_studentId: { examId, studentId } },
      update: { score, grade: grade || null, remarks: remarks || null, recordedById: req.user!.userId },
      create: {
        examId,
        studentId,
        score,
        grade: grade || null,
        remarks: remarks || null,
        recordedById: req.user!.userId,
      },
    });

    await logAudit({
      actorId: req.user!.userId,
      action: 'RECORD_EXAM_RESULT',
      entityType: 'ExamResult',
      entityId: result.id,
      after: result,
    });

    res.status(201).json(result);""",
    )

    write(path, text)

# ---------------------------------------------------------------------------
# letters.routes.ts
# ---------------------------------------------------------------------------
def patch_letters():
    path = ROOT / "backend" / "src" / "routes" / "letters.routes.ts"
    text = read(path)
    text = ensure_import(text, path)

    text = apply(
        text, path, "'ISSUE_LETTER'",
        """    const letter = await prisma.issuedLetter.create({
      data: {
        studentId,
        type,
        title,
        bodyText: bodyText.trim(),
        fileUrl: uploaded.secureUrl,
        filePublicId: uploaded.publicId,
        issuedById: req.user!.userId,
      },
    });

    res.status(201).json(letter);""",
        """    const letter = await prisma.issuedLetter.create({
      data: {
        studentId,
        type,
        title,
        bodyText: bodyText.trim(),
        fileUrl: uploaded.secureUrl,
        filePublicId: uploaded.publicId,
        issuedById: req.user!.userId,
      },
    });

    await logAudit({
      actorId: req.user!.userId,
      action: 'ISSUE_LETTER',
      entityType: 'IssuedLetter',
      entityId: letter.id,
      after: { studentId, type, title },
    });

    res.status(201).json(letter);""",
    )

    text = apply(
        text, path, "'DELETE_LETTER'",
        """  const letter = await prisma.issuedLetter.findUnique({ where: { id } });
  if (!letter) return res.status(404).json({ error: 'Letter not found' });

  await prisma.issuedLetter.delete({ where: { id } });
  res.status(204).send();""",
        """  const letter = await prisma.issuedLetter.findUnique({ where: { id } });
  if (!letter) return res.status(404).json({ error: 'Letter not found' });

  await prisma.issuedLetter.delete({ where: { id } });

  await logAudit({
    actorId: req.user!.userId,
    action: 'DELETE_LETTER',
    entityType: 'IssuedLetter',
    entityId: id,
    before: letter,
  });

  res.status(204).send();""",
    )

    write(path, text)

# ---------------------------------------------------------------------------
# documents.routes.ts
# ---------------------------------------------------------------------------
def patch_documents():
    path = ROOT / "backend" / "src" / "routes" / "documents.routes.ts"
    text = read(path)
    text = ensure_import(text, path)

    text = apply(
        text, path, "'UPLOAD_DOCUMENT'",
        """      const doc = await prisma.studentDocument.create({
        data: {
          studentId,
          title: title.trim(),
          fileUrl: uploaded.secureUrl,
          filePublicId: uploaded.publicId,
          uploadedById: req.user!.userId,
        },
      });

      res.status(201).json(doc);""",
        """      const doc = await prisma.studentDocument.create({
        data: {
          studentId,
          title: title.trim(),
          fileUrl: uploaded.secureUrl,
          filePublicId: uploaded.publicId,
          uploadedById: req.user!.userId,
        },
      });

      await logAudit({
        actorId: req.user!.userId,
        action: 'UPLOAD_DOCUMENT',
        entityType: 'StudentDocument',
        entityId: doc.id,
        after: { studentId, title: doc.title },
      });

      res.status(201).json(doc);""",
    )

    text = apply(
        text, path, "'DELETE_DOCUMENT'",
        """  await prisma.studentDocument.delete({ where: { id } });
  res.status(204).send();""",
        """  await prisma.studentDocument.delete({ where: { id } });

  await logAudit({
    actorId: req.user!.userId,
    action: 'DELETE_DOCUMENT',
    entityType: 'StudentDocument',
    entityId: id,
    before: doc,
  });

  res.status(204).send();""",
    )

    write(path, text)

# ---------------------------------------------------------------------------
# admin.routes.ts
# ---------------------------------------------------------------------------
def patch_admin():
    path = ROOT / "backend" / "src" / "routes" / "admin.routes.ts"
    text = read(path)
    text = ensure_import(text, path)

    # 1. Create staff user
    text = apply(
        text, path, "'CREATE_STAFF_USER'",
        """  if (groupsToJoin.length) {
    await prisma.groupMember.createMany({
      data: groupsToJoin.map((g) => ({ groupId: g.id, userId: user.id })),
      skipDuplicates: true,
    });
  }

  res.status(201).json(user);
});

// ---------- Suspend or reactivate a user ----------""",
        """  if (groupsToJoin.length) {
    await prisma.groupMember.createMany({
      data: groupsToJoin.map((g) => ({ groupId: g.id, userId: user.id })),
      skipDuplicates: true,
    });
  }

  await logAudit({
    actorId: req.user!.userId,
    action: 'CREATE_STAFF_USER',
    entityType: 'User',
    entityId: user.id,
    after: { name: user.name, email: user.email, role: user.role },
  });

  res.status(201).json(user);
});

// ---------- Suspend or reactivate a user ----------""",
    )

    # 2. Update user status
    text = apply(
        text, path, "'UPDATE_USER_STATUS'",
        """  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, name: true, status: true },
  });
  res.json(user);
});

// ---------- Grant or change a user's role ----------""",
        """  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, name: true, status: true },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_USER_STATUS',
    entityType: 'User',
    entityId: id,
    before: { status: target.status },
    after: { status: user.status },
  });

  res.json(user);
});

// ---------- Grant or change a user's role ----------""",
    )

    # 3. Update user role (highest priority -- privilege escalation trail)
    text = apply(
        text, path, "'UPDATE_USER_ROLE'",
        """  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  res.json(user);
});

// ---------- Reset a staff member's password (Admin/Founder only) ----------""",
        """  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_USER_ROLE',
    entityType: 'User',
    entityId: id,
    before: { role: target.role },
    after: { role: user.role },
  });

  res.json(user);
});

// ---------- Reset a staff member's password (Admin/Founder only) ----------""",
    )

    # 4. Reset password
    text = apply(
        text, path, "'RESET_USER_PASSWORD'",
        """await prisma.user.update({
  where: { id },
  data: {
    passwordHash,
    mustChangePassword: true,
    passwordChangedAt: null,
  },
});

res.json({ success: true });""",
        """await prisma.user.update({
  where: { id },
  data: {
    passwordHash,
    mustChangePassword: true,
    passwordChangedAt: null,
  },
});

await logAudit({
  actorId: req.user!.userId,
  action: 'RESET_USER_PASSWORD',
  entityType: 'User',
  entityId: id,
  after: { targetName: target.name },
});

res.json({ success: true });""",
    )

    # 5. Update user department
    text = apply(
        text, path, "'UPDATE_USER_DEPARTMENT'",
        """  if (departmentId) {
    const newGroup = await prisma.group.findFirst({ where: { type: 'DEPARTMENT', departmentId } });
    if (newGroup) {
      await prisma.groupMember
        .create({ data: { groupId: newGroup.id, userId: id } })
        .catch(() => {});
    }
  }

  res.json(updated);
});

// ---------- Create a new department ----------""",
        """  if (departmentId) {
    const newGroup = await prisma.group.findFirst({ where: { type: 'DEPARTMENT', departmentId } });
    if (newGroup) {
      await prisma.groupMember
        .create({ data: { groupId: newGroup.id, userId: id } })
        .catch(() => {});
    }
  }

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_USER_DEPARTMENT',
    entityType: 'User',
    entityId: id,
    before: { departmentId: target.departmentId },
    after: { departmentId: updated.department?.id ?? null },
  });

  res.json(updated);
});

// ---------- Create a new department ----------""",
    )

    # 6a. Delete department -- add a before-snapshot fetch
    text = apply(
        text, path, "departmentBefore",
        """router.delete('/departments/:id', async (req, res) => {
  const { id } = req.params;

  const programCount = await prisma.program.count({ where: { departmentId: id } });""",
        """router.delete('/departments/:id', async (req, res) => {
  const { id } = req.params;

  const departmentBefore = await prisma.department.findUnique({ where: { id }, select: { name: true } });

  const programCount = await prisma.program.count({ where: { departmentId: id } });""",
    )

    # 6b. Delete department -- log after the actual delete
    text = apply(
        text, path, "'DELETE_DEPARTMENT'",
        """  await prisma.department.delete({ where: { id } });
  res.status(204).send();
});

// ---------- Add a program (and its level) to a department ----------""",
        """  await prisma.department.delete({ where: { id } });

  await logAudit({
    actorId: req.user!.userId,
    action: 'DELETE_DEPARTMENT',
    entityType: 'Department',
    entityId: id,
    before: departmentBefore,
  });

  res.status(204).send();
});

// ---------- Add a program (and its level) to a department ----------""",
    )

    # 7a. Delete program -- add a before-snapshot fetch
    text = apply(
        text, path, "programBefore",
        """router.delete('/programs/:id', async (req, res) => {
  const { id } = req.params;

  const group = await prisma.group.findUnique({ where: { programId: id } });""",
        """router.delete('/programs/:id', async (req, res) => {
  const { id } = req.params;

  const programBefore = await prisma.program.findUnique({ where: { id }, select: { name: true, departmentId: true } });

  const group = await prisma.group.findUnique({ where: { programId: id } });""",
    )

    # 7b. Delete program -- log after the actual delete
    text = apply(
        text, path, "'DELETE_PROGRAM'",
        """  await prisma.program.delete({ where: { id } });
  res.status(204).send();
});

// ---------- Set/update a program's fee (versioned — past applicants keep what they were charged) ----------""",
        """  await prisma.program.delete({ where: { id } });

  await logAudit({
    actorId: req.user!.userId,
    action: 'DELETE_PROGRAM',
    entityType: 'Program',
    entityId: id,
    before: programBefore,
  });

  res.status(204).send();
});

// ---------- Set/update a program's fee (versioned — past applicants keep what they were charged) ----------""",
    )

    # 8. Remove the FIRST (dead) POST /programs/:id/fee -- the duplicate-route bug
    if "'SET_PROGRAM_FEE'" not in text:
        old_dead_route = """// ---------- Set/update a program's fee (versioned — past applicants keep what they were charged) ----------
router.post('/programs/:id/fee', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive fee amount is required' });
  }

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const fee = await prisma.programFee.create({
    data: { programId: id, amount: Math.round(Number(amount)) },
  });

  res.status(201).json(fee);
});

// ---------- Bulk-import existing students (for launch day, not new applicants) ----------"""
        if old_dead_route not in text:
            fail("Could not find the first (dead) POST /programs/:id/fee route to remove")
        text = text.replace(
            old_dead_route,
            "// ---------- Bulk-import existing students (for launch day, not new applicants) ----------",
            1,
        )

        # 9. Fix + log the SECOND (kept, live) POST /programs/:id/fee route
        old_live_route = """// ---------- Set/update a program's fee (versioned — old fee stays historical) ----------
router.post('/programs/:id/fee', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive fee amount is required' });
  }

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const fee = await prisma.programFee.create({
    data: { programId: id, amount: Number(amount), setBy: req.user!.userId },
  });

  res.status(201).json(fee);
});"""
        new_live_route = """// ---------- Set/update a program's fee (versioned — old fee stays historical) ----------
router.post('/programs/:id/fee', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive fee amount is required' });
  }

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const fee = await prisma.programFee.create({
    data: { programId: id, amount: Number(amount), setBy: req.user!.userId },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'SET_PROGRAM_FEE',
    entityType: 'ProgramFee',
    entityId: fee.id,
    after: { programId: id, amount: fee.amount },
  });

  res.status(201).json(fee);
});"""
        if old_live_route not in text:
            fail("Could not find the second (live) POST /programs/:id/fee route to patch")
        text = text.replace(old_live_route, new_live_route, 1)
    else:
        print(f"[OK] {path.name}: 'SET_PROGRAM_FEE' already present, skipping duplicate-route fix")

    # 10a. Update site settings -- add a before-snapshot fetch
    text = apply(
        text, path, "settingsBefore",
        """  } = req.body;

  const settings = await prisma.siteSettings.update({""",
        """  } = req.body;

  const settingsBefore = await prisma.siteSettings.findUnique({ where: { id: 1 } });

  const settings = await prisma.siteSettings.update({""",
    )

    # 10b. Update site settings -- log after the update
    text = apply(
        text, path, "'UPDATE_SITE_SETTINGS'",
        """  res.json(settings);
});

// ---------- Repair missing group memberships ----------""",
        """  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_SITE_SETTINGS',
    entityType: 'SiteSettings',
    entityId: '1',
    before: settingsBefore,
    after: settings,
  });

  res.json(settings);
});

// ---------- Repair missing group memberships ----------""",
    )

    write(path, text)

# ---------------------------------------------------------------------------
# academic.routes.ts
# ---------------------------------------------------------------------------
def patch_academic():
    path = ROOT / "backend" / "src" / "routes" / "academic.routes.ts"
    text = read(path)
    text = ensure_import(text, path)

    # /timetable/:id DELETE
    text = apply(
        text, path, "action: 'DELETE_TIMETABLE_ENTRY',\n      entityType",
        """    await prisma.timetableEntry.delete({
      where: { id },
    });

    res.json({
      message: 'Timetable entry deleted successfully',
    });""",
        """    await prisma.timetableEntry.delete({
      where: { id },
    });

    await logAudit({
      actorId: req.user!.userId,
      action: 'DELETE_TIMETABLE_ENTRY',
      entityType: 'TimetableEntry',
      entityId: id,
      before: existing,
    });

    res.json({
      message: 'Timetable entry deleted successfully',
    });""",
    )

    # /units/:id DELETE -- add a before-snapshot fetch, then log after delete
    text = apply(
        text, path, "unitBefore",
        """    const materialCount = await prisma.material.count({
      where: { unitId: id },
    });

    if (materialCount > 0) {
      return res.status(409).json({
        error: 'This unit has learning materials. Remove them first.',
      });
    }

    await prisma.unit.delete({
      where: { id },
    });

    res.json({ message: 'Unit deleted successfully' });""",
        """    const unitBefore = await prisma.unit.findUnique({ where: { id } });

    const materialCount = await prisma.material.count({
      where: { unitId: id },
    });

    if (materialCount > 0) {
      return res.status(409).json({
        error: 'This unit has learning materials. Remove them first.',
      });
    }

    await prisma.unit.delete({
      where: { id },
    });

    await logAudit({
      actorId: req.user!.userId,
      action: 'DELETE_UNIT',
      entityType: 'Unit',
      entityId: id,
      before: unitBefore,
    });

    res.json({ message: 'Unit deleted successfully' });""",
    )

    # /timetable/entries/:id DELETE
    text = apply(
        text, path, "action: 'DELETE_TIMETABLE_ENTRY',\n      entityType: 'TimetableEntry',\n      entityId: id,\n      before: existing,\n    });\n\n    res.json({\n      message: 'Timetable entry deleted',",
        """    await prisma.timetableEntry.delete({
      where: {
        id,
      },
    });

    res.json({
      message: 'Timetable entry deleted',
    });""",
        """    await prisma.timetableEntry.delete({
      where: {
        id,
      },
    });

    await logAudit({
      actorId: req.user!.userId,
      action: 'DELETE_TIMETABLE_ENTRY',
      entityType: 'TimetableEntry',
      entityId: id,
      before: existing,
    });

    res.json({
      message: 'Timetable entry deleted',
    });""",
    )

    write(path, text)

# ---------------------------------------------------------------------------
if __name__ == "__main__":
    patch_finance()
    patch_examinations()
    patch_letters()
    patch_documents()
    patch_admin()
    patch_academic()
    print("[OK] Audit logging wired into all agreed high-stakes routes.")
