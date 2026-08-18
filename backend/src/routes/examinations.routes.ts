import { Router } from 'express';
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
