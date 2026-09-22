import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  InstitutionInfo,
  generateResultsSlipPdf,
  generateFeeStatementPdf,
  generateReceiptPdf,
  generateExamCardPdf,
} from '../services/student-pdf.service';

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

// ---------- Documents (PDF): results slip, fee statement, receipts, exam card ----------
// Every endpoint is scoped to the logged-in student's own data (req.user.userId).

async function getInstitution(): Promise<InstitutionInfo> {
  const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return {
    name: s?.institutionName || 'Institution',
    address: s?.address,
    phone: s?.phone,
    email: s?.email,
  };
}

function sendPdf(res: import('express').Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}

function safeFilePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'student';
}

function receiptNumber(paymentId: string): string {
  return 'RCT-' + paymentId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Minimum share of the active term's fees that must be paid before an exam card is issued.
// Configuration, not code: set EXAM_CARD_MIN_PAID_PERCENT (0-100) in the environment. Defaults to 100.
function examCardMinPaidPercent(): number {
  const raw = process.env.EXAM_CARD_MIN_PAID_PERCENT;
  if (raw && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  return 100;
}

async function programmeNamesFor(studentId: string): Promise<string[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: { program: true },
  });
  return enrollments.map((e) => e.program.name + (e.program.level ? ' (' + e.program.level + ')' : ''));
}

function fetchActiveRegistrations(studentId: string, termId: string) {
  return prisma.unitRegistration.findMany({
    where: { studentId, termId, status: 'REGISTERED', enrollment: { status: 'ACTIVE' } },
    include: { unit: true, enrollment: { include: { program: true } } },
  });
}
type RegistrationRow = Awaited<ReturnType<typeof fetchActiveRegistrations>>[number];

async function loadExamCardContext(studentId: string) {
  const requiredPercent = examCardMinPaidPercent();
  const term = await prisma.term.findFirst({ where: { isActive: true } });

  const blank = { eligible: false, reason: null as string | null, termName: null as string | null, paidPercent: 0, requiredPercent, balance: 0 };

  if (!term) {
    return { status: { ...blank, reason: 'There is no active term at the moment.' }, term: null, registrations: [] as RegistrationRow[] };
  }

  const registrations = await fetchActiveRegistrations(studentId, term.id);

  const invoices = await prisma.invoice.findMany({
    where: { studentId, termId: term.id, status: { not: 'CANCELLED' } },
    include: { payments: true },
  });

  const billed = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paid = invoices.reduce((s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0), 0);
  const balance = Math.max(0, billed - paid);
  // Nothing billed for this term means nothing is owed, so the fee check passes.
  const paidPercent = billed > 0 ? (paid / billed) * 100 : 100;

  const status = { ...blank, termName: term.name, paidPercent, balance };

  if (registrations.length === 0) {
    return {
      status: { ...status, reason: 'You have no registered units for ' + term.name + '. Register your units first.' },
      term,
      registrations,
    };
  }

  if (paidPercent + 1e-9 < requiredPercent) {
    return {
      status: {
        ...status,
        reason:
          'Your fees for ' + term.name + ' are ' + Math.floor(paidPercent) + '% paid; ' + requiredPercent +
          '% is required before an exam card can be issued. Outstanding balance: KES ' +
          balance.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '.',
      },
      term,
      registrations,
    };
  }

  return { status: { ...status, eligible: true }, term, registrations };
}

// What the Documents page needs in one call: terms with results, payments (for receipts), exam card status.
router.get('/documents/overview', requireAuth, requireRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user!.userId;

    const results = await prisma.examResult.findMany({
      where: { studentId },
      include: { exam: { include: { term: true } } },
    });
    const termMap = new Map<string, { id: string; name: string; startDate: Date }>();
    for (const r of results) {
      termMap.set(r.exam.term.id, { id: r.exam.term.id, name: r.exam.term.name, startDate: r.exam.term.startDate });
    }
    const resultTerms = Array.from(termMap.values()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    const payments = await prisma.feePayment.findMany({
      where: { invoice: { studentId } },
      include: { invoice: { include: { term: true } } },
      orderBy: { paidAt: 'desc' },
    });

    const { status } = await loadExamCardContext(studentId);

    res.json({
      resultTerms: resultTerms.map((t) => ({ id: t.id, name: t.name })),
      payments: payments.map((p) => ({
        id: p.id,
        receiptNo: receiptNumber(p.id),
        paidAt: p.paidAt,
        amount: Number(p.amount),
        method: p.method,
        description: p.invoice.description,
        termName: p.invoice.term.name,
      })),
      examCard: status,
    });
  } catch (err) {
    console.error('documents/overview failed', err);
    res.status(500).json({ error: 'Could not load your documents' });
  }
});

router.get('/documents/results-slip', requireAuth, requireRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user!.userId;
    const termId = typeof req.query.termId === 'string' && req.query.termId ? req.query.termId : undefined;

    const results = await prisma.examResult.findMany({
      where: { studentId, ...(termId ? { exam: { termId } } : {}) },
      include: { exam: { include: { unit: true, term: true } } },
    });
    if (results.length === 0) {
      return res.status(404).json({ error: 'No results have been recorded for you yet.' });
    }

    const groups = new Map<string, { termName: string; startDate: Date; rows: Array<{ unitName: string; examName: string; score: number; maxScore: number; grade: string | null; remarks: string | null }> }>();
    for (const r of results) {
      const key = r.exam.term.id;
      if (!groups.has(key)) groups.set(key, { termName: r.exam.term.name, startDate: r.exam.term.startDate, rows: [] });
      groups.get(key)!.rows.push({
        unitName: r.exam.unit.name,
        examName: r.exam.name,
        score: Number(r.score),
        maxScore: Number(r.exam.maxScore),
        grade: r.grade,
        remarks: r.remarks,
      });
    }
    const terms = Array.from(groups.values())
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map((g) => ({
        termName: g.termName,
        rows: g.rows.sort((a, b) => a.unitName.localeCompare(b.unitName) || a.examName.localeCompare(b.examName)),
      }));

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, admissionNumber: true } });
    const pdf = await generateResultsSlipPdf({
      institution: await getInstitution(),
      studentName: student?.name || 'Student',
      admissionNumber: student?.admissionNumber,
      programmes: await programmeNamesFor(studentId),
      terms,
      generatedAt: new Date(),
    });
    sendPdf(res, pdf, 'Results_Slip_' + safeFilePart(student?.name || 'student') + '.pdf');
  } catch (err) {
    console.error('documents/results-slip failed', err);
    res.status(500).json({ error: 'Could not generate your results slip' });
  }
});

router.get('/documents/fee-statement', requireAuth, requireRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user!.userId;
    const invoices = await prisma.invoice.findMany({
      where: { studentId },
      include: { payments: true, term: true },
      orderBy: { createdAt: 'asc' },
    });
    if (invoices.length === 0) {
      return res.status(404).json({ error: 'There are no invoices on your account yet.' });
    }

    const payments: Array<{ date: Date; receiptNo: string; description: string; method: string; reference: string | null; amount: number }> = [];
    for (const inv of invoices) {
      for (const p of inv.payments) {
        payments.push({
          date: p.paidAt,
          receiptNo: receiptNumber(p.id),
          description: inv.description,
          method: p.method,
          reference: p.reference,
          amount: Number(p.amount),
        });
      }
    }
    payments.sort((a, b) => a.date.getTime() - b.date.getTime());

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, admissionNumber: true } });
    const pdf = await generateFeeStatementPdf({
      institution: await getInstitution(),
      studentName: student?.name || 'Student',
      admissionNumber: student?.admissionNumber,
      invoices: invoices.map((inv) => ({
        termName: inv.term.name,
        description: inv.description,
        amount: Number(inv.amount),
        paid: inv.payments.reduce((s, p) => s + Number(p.amount), 0),
        status: inv.status,
      })),
      payments,
      generatedAt: new Date(),
    });
    sendPdf(res, pdf, 'Fee_Statement_' + safeFilePart(student?.name || 'student') + '.pdf');
  } catch (err) {
    console.error('documents/fee-statement failed', err);
    res.status(500).json({ error: 'Could not generate your fee statement' });
  }
});

router.get('/documents/receipt/:paymentId', requireAuth, requireRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user!.userId;
    const payment = await prisma.feePayment.findUnique({
      where: { id: String(req.params.paymentId) },
      include: {
        invoice: { include: { term: true, payments: true, student: { select: { name: true, admissionNumber: true } } } },
        recordedBy: { select: { name: true } },
      },
    });
    // Same response whether it doesn't exist or belongs to someone else: no probing of other students' payments.
    if (!payment || payment.invoice.studentId !== studentId) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const paidThroughThisPayment = payment.invoice.payments
      .filter((p) => p.paidAt.getTime() <= payment.paidAt.getTime())
      .reduce((s, p) => s + Number(p.amount), 0);

    const receiptNo = receiptNumber(payment.id);
    const pdf = await generateReceiptPdf({
      institution: await getInstitution(),
      receiptNo,
      studentName: payment.invoice.student.name,
      admissionNumber: payment.invoice.student.admissionNumber,
      termName: payment.invoice.term.name,
      invoiceDescription: payment.invoice.description,
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt,
      recordedByName: payment.recordedBy.name,
      invoiceBalanceAfter: Math.max(0, Number(payment.invoice.amount) - paidThroughThisPayment),
    });
    sendPdf(res, pdf, receiptNo + '.pdf');
  } catch (err) {
    console.error('documents/receipt failed', err);
    res.status(500).json({ error: 'Could not generate your receipt' });
  }
});

router.get('/documents/exam-card', requireAuth, requireRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user!.userId;
    const { status, term, registrations } = await loadExamCardContext(studentId);
    if (!status.eligible || !term) {
      return res.status(403).json({ error: status.reason || 'You are not eligible for an exam card right now.' });
    }

    const unitIds = registrations.map((r) => r.unitId);
    const exams = await prisma.exam.findMany({
      where: { termId: term.id, unitId: { in: unitIds } },
      include: { unit: true },
      orderBy: { examDate: 'asc' },
    });

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, admissionNumber: true } });
    const first = registrations[0];
    const pdf = await generateExamCardPdf({
      institution: await getInstitution(),
      studentName: student?.name || 'Student',
      admissionNumber: student?.admissionNumber,
      programmeName: first.enrollment.program.name + (first.enrollment.program.level ? ' (' + first.enrollment.program.level + ')' : ''),
      termName: term.name,
      units: registrations.map((r) => r.unit.name).sort((a, b) => a.localeCompare(b)),
      exams: exams.map((e) => ({ unitName: e.unit.name, examName: e.name, examDate: e.examDate })),
      generatedAt: new Date(),
    });
    sendPdf(res, pdf, 'Exam_Card_' + safeFilePart(student?.name || 'student') + '.pdf');
  } catch (err) {
    console.error('documents/exam-card failed', err);
    res.status(500).json({ error: 'Could not generate your exam card' });
  }
});

export default router;
