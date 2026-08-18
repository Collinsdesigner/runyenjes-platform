import { Router } from 'express';
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
