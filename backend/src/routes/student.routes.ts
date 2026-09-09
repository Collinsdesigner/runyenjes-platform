import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- My Academics: enrollment + this term's unit registrations ----------
router.get('/academics', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: req.user!.userId },
    include: { program: { include: { department: true } } },
  });

  const term = await prisma.term.findFirst({ where: { isActive: true } });

  const registrations = term
    ? await prisma.unitRegistration.findMany({
        where: { studentId: req.user!.userId, termId: term.id },
        include: { unit: true },
      })
    : [];

  res.json({
    term: term?.name || null,
    enrollments: enrollments.map((e) => ({
      programName: e.program.name,
      programLevel: e.program.level,
      departmentName: e.program.department.name,
      status: e.status,
    })),
    registrations: registrations.map((r) => ({
      unitName: r.unit.name,
      status: r.status,
    })),
  });
});

// ---------- Fees & Payments: my invoices + payments ----------
router.get('/fees', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { studentId: req.user!.userId },
    include: { payments: true, term: true },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = invoices.map((inv) => {
    const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      id: inv.id,
      description: inv.description,
      termName: inv.term.name,
      amount: inv.amount,
      paid,
      balance: Number(inv.amount) - paid,
      status: inv.status,
      dueDate: inv.dueDate,
    };
  });

  res.json({ invoices: shaped });
});

// ---------- Results: my exam results ----------
router.get('/results', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const results = await prisma.examResult.findMany({
    where: { studentId: req.user!.userId },
    include: { exam: { include: { unit: true, term: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = results.map((r) => ({
    id: r.id,
    examName: r.exam.name,
    unitName: r.exam.unit.name,
    termName: r.exam.term.name,
    score: r.score,
    maxScore: r.exam.maxScore,
    grade: r.grade,
    remarks: r.remarks,
  }));

  res.json({ results: shaped });
});

export default router;
