#!/usr/bin/env python3
"""
Generates finance.routes.ts, hr.routes.ts, examinations.routes.ts, and
stores.routes.ts inside src/routes/, matching the existing codebase style
(Router from express, prisma from ../lib/prisma, requireAuth/requireRole
from ../middleware/auth, res.json / res.status(x).json({ error })).

Also patches src/index.ts to import and mount each new router.

USAGE (run from ~/runyenjes-platform/backend):
    python3 generate_erp_routes.py

Safe to re-run: it will refuse to overwrite an existing route file unless
you pass --force, and it will refuse to patch index.ts twice.
"""

import argparse
import os
import re
import sys

ROUTES_DIR = os.path.join("src", "routes")
INDEX_PATH = os.path.join("src", "index.ts")

FINANCE_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Finance/Admin: list invoices (optionally filter by student or term) ----------
router.get('/invoices', requireAuth, requireRole('FINANCE_OFFICER', 'ADMIN'), async (req, res) => {
  const { studentId, termId, status } = req.query as { studentId?: string; termId?: string; status?: string };

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(studentId ? { studentId } : {}),
      ...(termId ? { termId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      student: { select: { id: true, name: true, email: true, admissionNumber: true } },
      term: true,
      payments: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(invoices);
});

// ---------- Finance/Admin: get a single invoice ----------
router.get('/invoices/:id', requireAuth, requireRole('FINANCE_OFFICER', 'ADMIN'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      student: { select: { id: true, name: true, email: true, admissionNumber: true } },
      term: true,
      payments: { include: { recordedBy: { select: { id: true, name: true } } } },
    },
  });

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// ---------- Finance/Admin: create an invoice for a student ----------
router.post('/invoices', requireAuth, requireRole('FINANCE_OFFICER', 'ADMIN'), async (req, res) => {
  const { studentId, termId, description, amount, dueDate } = req.body;

  if (!studentId || !termId || !description || amount === undefined) {
    return res.status(400).json({ error: 'studentId, termId, description and amount are required' });
  }

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== 'STUDENT') {
    return res.status(404).json({ error: 'Student not found' });
  }

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term) return res.status(404).json({ error: 'Term not found' });

  const invoice = await prisma.invoice.create({
    data: {
      studentId,
      termId,
      description,
      amount,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  res.status(201).json(invoice);
});

// ---------- Finance/Admin: record a payment against an invoice ----------
// Recomputes the invoice status from the sum of its payments so the
// status field is always derived, never trusted from client input.
router.post(
  '/invoices/:id/payments',
  requireAuth,
  requireRole('FINANCE_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { id: invoiceId } = req.params;
    const { amount, method, reference } = req.body;

    if (amount === undefined || !method) {
      return res.status(400).json({ error: 'amount and method are required' });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const payment = await prisma.feePayment.create({
      data: {
        invoiceId,
        amount,
        method,
        reference: reference || null,
        recordedById: req.user!.userId,
      },
    });

    const totalPaid = [...invoice.payments, payment].reduce((sum, p) => sum + Number(p.amount), 0);
    const invoiceAmount = Number(invoice.amount);

    const status =
      totalPaid <= 0 ? 'PENDING' : totalPaid < invoiceAmount ? 'PARTIALLY_PAID' : 'PAID';

    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

    res.status(201).json(payment);
  }
);

// ---------- Student: view own invoices ----------
router.get('/my-invoices', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { studentId: req.user!.userId },
    include: { term: true, payments: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(invoices);
});

export default router;
"""

HR_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- HR/Admin: list staff profiles ----------
router.get('/staff', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const staff = await prisma.staffProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(staff);
});

// ---------- HR/Admin: get a single staff profile ----------
router.get('/staff/:id', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const staff = await prisma.staffProfile.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
  });

  if (!staff) return res.status(404).json({ error: 'Staff profile not found' });
  res.json(staff);
});

// ---------- HR/Admin: create a staff profile for an existing user ----------
router.post('/staff', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const { userId, employeeNumber, position, employmentType, dateHired, nationalId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = await prisma.staffProfile.findUnique({ where: { userId } });
  if (existing) return res.status(409).json({ error: 'This user already has a staff profile' });

  const staff = await prisma.staffProfile.create({
    data: {
      userId,
      employeeNumber: employeeNumber || null,
      position: position || null,
      employmentType: employmentType || 'FULL_TIME',
      dateHired: dateHired ? new Date(dateHired) : null,
      nationalId: nationalId || null,
    },
  });

  res.status(201).json(staff);
});

// ---------- HR/Admin: update a staff profile ----------
router.patch('/staff/:id', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const { position, employmentType, dateHired, nationalId, status } = req.body;

  const staff = await prisma.staffProfile.update({
    where: { id: req.params.id },
    data: {
      ...(position !== undefined ? { position } : {}),
      ...(employmentType !== undefined ? { employmentType } : {}),
      ...(dateHired !== undefined ? { dateHired: dateHired ? new Date(dateHired) : null } : {}),
      ...(nationalId !== undefined ? { nationalId } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  res.json(staff);
});

// ---------- HR/Admin: list leave requests (optionally filter by status) ----------
router.get('/leave-requests', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const { status } = req.query as { status?: string };

  const requests = await prisma.leaveRequest.findMany({
    where: status ? { status: status as any } : {},
    include: {
      staff: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
});

// ---------- Any authenticated staff member: submit a leave request ----------
router.post('/leave-requests', requireAuth, async (req, res) => {
  const { type, startDate, endDate, reason } = req.body;

  if (!type || !startDate || !endDate) {
    return res.status(400).json({ error: 'type, startDate and endDate are required' });
  }

  const request = await prisma.leaveRequest.create({
    data: {
      staffId: req.user!.userId,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason || null,
    },
  });

  res.status(201).json(request);
});

// ---------- Staff: view own leave requests ----------
router.get('/my-leave-requests', requireAuth, async (req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { staffId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
});

// ---------- HR/Admin: approve or reject a leave request ----------
router.patch(
  '/leave-requests/:id/decision',
  requireAuth,
  requireRole('HR_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { decision } = req.body; // 'APPROVED' | 'REJECTED'

    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ error: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    const request = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: decision, approvedById: req.user!.userId },
    });

    res.json(request);
  }
);

export default router;
"""

EXAMINATIONS_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Teacher/Exam officer/Admin: list exams (optionally filter by unit or term) ----------
router.get('/exams', requireAuth, requireRole('EXAM_OFFICER', 'ADMIN', 'TEACHER'), async (req, res) => {
  const { unitId, termId } = req.query as { unitId?: string; termId?: string };

  const exams = await prisma.exam.findMany({
    where: {
      ...(unitId ? { unitId } : {}),
      ...(termId ? { termId } : {}),
    },
    include: { unit: true, term: true, createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(exams);
});

// ---------- Teacher/Exam officer/Admin: create an exam for a unit + term ----------
router.post('/exams', requireAuth, requireRole('EXAM_OFFICER', 'ADMIN', 'TEACHER'), async (req, res) => {
  const { unitId, termId, name, examDate, maxScore, weight } = req.body;

  if (!unitId || !termId || !name) {
    return res.status(400).json({ error: 'unitId, termId and name are required' });
  }

  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term) return res.status(404).json({ error: 'Term not found' });

  const exam = await prisma.exam.create({
    data: {
      unitId,
      termId,
      name,
      examDate: examDate ? new Date(examDate) : null,
      maxScore: maxScore ?? 100,
      weight: weight ?? null,
      createdById: req.user!.userId,
    },
  });

  res.status(201).json(exam);
});

// ---------- Teacher/Exam officer/Admin: record (or update) one student's result for an exam ----------
router.post(
  '/exams/:examId/results',
  requireAuth,
  requireRole('EXAM_OFFICER', 'ADMIN', 'TEACHER'),
  async (req, res) => {
    const { examId } = req.params;
    const { studentId, score, grade, remarks } = req.body;

    if (!studentId || score === undefined) {
      return res.status(400).json({ error: 'studentId and score are required' });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Student not found' });
    }

    const result = await prisma.examResult.upsert({
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

    res.status(201).json(result);
  }
);

// ---------- Teacher/Exam officer/Admin: list all results for an exam ----------
router.get(
  '/exams/:examId/results',
  requireAuth,
  requireRole('EXAM_OFFICER', 'ADMIN', 'TEACHER'),
  async (req, res) => {
    const results = await prisma.examResult.findMany({
      where: { examId: req.params.examId },
      include: { student: { select: { id: true, name: true, admissionNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(results);
  }
);

// ---------- Student: view own results ----------
router.get('/my-results', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const results = await prisma.examResult.findMany({
    where: { studentId: req.user!.userId },
    include: { exam: { include: { unit: true, term: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(results);
});

export default router;
"""

STORES_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Stores/Admin: list inventory items (optionally filter by department) ----------
router.get('/items', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const { departmentId } = req.query as { departmentId?: string };

  const items = await prisma.inventoryItem.findMany({
    where: departmentId ? { departmentId } : {},
    include: { department: true },
    orderBy: { name: 'asc' },
  });

  res.json(items);
});

// ---------- Stores/Admin: get a single item with its movement history ----------
router.get('/items/:id', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: req.params.id },
    include: {
      department: true,
      movements: {
        include: { recordedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// ---------- Stores/Admin: create a new inventory item ----------
router.post('/items', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const { name, category, uom, reorderLevel, departmentId } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const item = await prisma.inventoryItem.create({
    data: {
      name,
      category: category || null,
      uom: uom || 'pcs',
      reorderLevel: reorderLevel ?? 0,
      departmentId: departmentId || null,
    },
  });

  res.status(201).json(item);
});

// ---------- Stores/Admin: update item details (not quantity — use /movements for that) ----------
router.patch('/items/:id', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const { name, category, uom, reorderLevel, departmentId } = req.body;

  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(uom !== undefined ? { uom } : {}),
      ...(reorderLevel !== undefined ? { reorderLevel } : {}),
      ...(departmentId !== undefined ? { departmentId } : {}),
    },
  });

  res.json(item);
});

// ---------- Stores/Admin: record a stock movement (receipt/issue/adjustment) ----------
// Runs in a transaction so quantityOnHand and the movement log never drift apart.
router.post(
  '/items/:id/movements',
  requireAuth,
  requireRole('STORES_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { id: itemId } = req.params;
    const { type, quantity, reason } = req.body;

    if (!type || quantity === undefined) {
      return res.status(400).json({ error: 'type and quantity are required' });
    }
    if (!['RECEIPT', 'ISSUE', 'ADJUSTMENT'].includes(type)) {
      return res.status(400).json({ error: "type must be 'RECEIPT', 'ISSUE' or 'ADJUSTMENT'" });
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const qty = Number(quantity);
    const delta = type === 'ISSUE' ? -Math.abs(qty) : Math.abs(qty);
    const newQuantity = Number(item.quantityOnHand) + delta;

    if (newQuantity < 0) {
      return res.status(400).json({ error: 'This movement would take stock below zero' });
    }

    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: { itemId, type, quantity: qty, reason: reason || null, recordedById: req.user!.userId },
      }),
      prisma.inventoryItem.update({ where: { id: itemId }, data: { quantityOnHand: newQuantity } }),
    ]);

    res.status(201).json(movement);
  }
);

export default router;
"""

FILES = {
    "finance.routes.ts": FINANCE_TS,
    "hr.routes.ts": HR_TS,
    "examinations.routes.ts": EXAMINATIONS_TS,
    "stores.routes.ts": STORES_TS,
}

# (import line, mount line) pairs to insert into index.ts
INDEX_INSERTS = [
    ("import financeRoutes from './routes/finance.routes';", "app.use('/finance', financeRoutes);"),
    ("import hrRoutes from './routes/hr.routes';", "app.use('/hr', hrRoutes);"),
    (
        "import examinationsRoutes from './routes/examinations.routes';",
        "app.use('/examinations', examinationsRoutes);",
    ),
    ("import storesRoutes from './routes/stores.routes';", "app.use('/stores', storesRoutes);"),
]


def write_route_files(force: bool) -> None:
    if not os.path.isdir(ROUTES_DIR):
        print(f"ERROR: '{ROUTES_DIR}' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)

    for filename, content in FILES.items():
        path = os.path.join(ROUTES_DIR, filename)
        if os.path.exists(path) and not force:
            print(f"SKIP  {path} already exists (use --force to overwrite)")
            continue
        with open(path, "w") as f:
            f.write(content)
        print(f"WROTE {path}")


def patch_index_ts() -> None:
    if not os.path.isfile(INDEX_PATH):
        print(f"ERROR: '{INDEX_PATH}' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)

    with open(INDEX_PATH, "r") as f:
        content = f.read()

    if "finance.routes" in content:
        print(f"SKIP  {INDEX_PATH} already references finance.routes — assuming already patched.")
        return

    # 1. Insert new imports right after the last existing route import.
    import_lines = "\n".join(pair[0] for pair in INDEX_INSERTS)
    last_import_match = list(re.finditer(r"^import .*from '\./routes/.*';$", content, re.MULTILINE))
    if not last_import_match:
        print("ERROR: could not find any existing route imports to anchor on. Patch index.ts manually.")
        sys.exit(1)
    insert_pos = last_import_match[-1].end()
    content = content[:insert_pos] + "\n" + import_lines + content[insert_pos:]

    # 2. Insert new app.use(...) lines right after the last existing route mount.
    mount_lines = "\n".join(pair[1] for pair in INDEX_INSERTS)
    last_mount_match = list(re.finditer(r"^app\.use\('/[a-zA-Z]+',.*\);$", content, re.MULTILINE))
    if not last_mount_match:
        print("ERROR: could not find any existing app.use(...) route mounts to anchor on. Patch index.ts manually.")
        sys.exit(1)
    insert_pos = last_mount_match[-1].end()
    content = content[:insert_pos] + "\n" + mount_lines + content[insert_pos:]

    with open(INDEX_PATH, "w") as f:
        f.write(content)

    print(f"PATCHED {INDEX_PATH} (added 4 imports + 4 app.use mounts)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="overwrite existing route files if present")
    args = parser.parse_args()

    write_route_files(args.force)
    patch_index_ts()

    print("\nDone. Review the diffs with: git diff src/index.ts src/routes/")


if __name__ == "__main__":
    main()
