import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Institution reporting overview (Registrar + Admin) ----------
router.get('/overview', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const [students, staffCounts, departments, programmes, units, admissionsByStatus, outstandingInvoices] =
    await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      prisma.user.groupBy({
        by: ['role'],
        where: { status: 'ACTIVE', role: { notIn: ['STUDENT', 'ALUMNI'] } },
        _count: { role: true },
      }),
      prisma.department.count(),
      prisma.program.count(),
      prisma.unit.count(),
      prisma.application.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.invoice.findMany({
        where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
        include: { payments: true },
      }),
    ]);

  const outstandingBalance = outstandingInvoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(inv.amount) - paid);
  }, 0);

  res.json({
    students,
    staffByRole: staffCounts.map((s) => ({ role: s.role, count: s._count.role })),
    departments,
    programmes,
    units,
    admissionsByStatus: admissionsByStatus.map((a) => ({ status: a.status, count: a._count.status })),
    outstandingInvoiceCount: outstandingInvoices.length,
    outstandingBalance,
  });
});

// ---------- Get the shared report notes ----------
router.get('/notes', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const note = await prisma.reportNote.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, content: '' },
  });
  res.json({ content: note.content, updatedAt: note.updatedAt });
});

// ---------- Update the shared report notes ----------
router.put('/notes', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ error: 'content is required' });
  }

  const note = await prisma.reportNote.upsert({
    where: { id: 1 },
    update: { content, updatedById: req.user!.userId },
    create: { id: 1, content, updatedById: req.user!.userId },
  });

  res.json({ content: note.content, updatedAt: note.updatedAt });
});

export default router;
