import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Teacher: my assigned units for the active term ----------
// Real data only -- UnitLecturer assignments + a live UnitRegistration
// count per unit. No placeholder data, no new models needed.
router.get('/units', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) {
    return res.json({ term: null, units: [] });
  }

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
    include: { unit: { include: { program: true } } },
  });

  const unitIds = assignments.map((a) => a.unitId);

  const registrationCounts = unitIds.length
    ? await prisma.unitRegistration.groupBy({
        by: ['unitId'],
        where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
        _count: { unitId: true },
      })
    : [];

  const countMap = new Map(registrationCounts.map((r) => [r.unitId, r._count.unitId]));

  const units = assignments.map((a) => ({
    unitId: a.unitId,
    unitName: a.unit.name,
    programmeName: a.unit.program.name,
    programmeLevel: a.unit.program.level,
    studentCount: countMap.get(a.unitId) || 0,
  }));

  res.json({ term: term.name, units });
});

// ---------- Teacher: roster of students across my units this term ----------
router.get('/students', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) {
    return res.json({ term: null, students: [] });
  }

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);

  if (unitIds.length === 0) {
    return res.json({ term: term.name, students: [] });
  }

  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
    include: {
      student: { select: { id: true, name: true, admissionNumber: true } },
      unit: { select: { name: true } },
    },
  });

  const studentMap = new Map<string, { studentId: string; name: string; admissionNumber: string | null; units: string[] }>();

  for (const r of registrations) {
    const existing = studentMap.get(r.studentId);
    if (existing) {
      existing.units.push(r.unit.name);
    } else {
      studentMap.set(r.studentId, {
        studentId: r.studentId,
        name: r.student.name,
        admissionNumber: r.student.admissionNumber,
        units: [r.unit.name],
      });
    }
  }

  res.json({ term: term.name, students: Array.from(studentMap.values()) });
});

// ---------- Teacher: list assessments (exams) across my units this term ----------
router.get('/assessments', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, exams: [] });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return res.json({ term: term.name, exams: [] });

  const exams = await prisma.exam.findMany({
    where: { unitId: { in: unitIds }, termId: term.id },
    include: { unit: true, results: true },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = exams.map((e) => ({
    id: e.id,
    name: e.name,
    unitId: e.unitId,
    unitName: e.unit.name,
    examDate: e.examDate,
    maxScore: e.maxScore,
    resultCount: e.results.length,
  }));

  res.json({ term: term.name, exams: shaped });
});

// ---------- Teacher: create an assessment (exam) for one of my units ----------
router.post('/assessments', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { unitId, name, examDate, maxScore } = req.body;
  if (!unitId || !name) {
    return res.status(400).json({ error: 'unitId and name are required' });
  }

  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.status(400).json({ error: 'No active academic term right now' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId, termId: term.id },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You are not assigned to teach this unit this term' });
  }

  const exam = await prisma.exam.create({
    data: {
      unitId,
      termId: term.id,
      name,
      examDate: examDate ? new Date(examDate) : null,
      maxScore: maxScore || 100,
      createdById: req.user!.userId,
    },
  });

  res.status(201).json(exam);
});

// ---------- Teacher: roster for one of my exams, with any existing result ----------
router.get('/assessments/:examId/roster', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return res.status(404).json({ error: 'Assessment not found' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId: exam.unitId, termId: exam.termId },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You do not teach the unit for this assessment' });
  }

  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: exam.unitId, termId: exam.termId, status: 'REGISTERED' },
    include: { student: { select: { id: true, name: true, admissionNumber: true } } },
  });

  const results = await prisma.examResult.findMany({ where: { examId } });
  const resultMap = new Map(results.map((r) => [r.studentId, r]));

  const roster = registrations.map((r) => ({
    studentId: r.studentId,
    name: r.student.name,
    admissionNumber: r.student.admissionNumber,
    score: resultMap.get(r.studentId)?.score ?? null,
    remarks: resultMap.get(r.studentId)?.remarks ?? null,
  }));

  res.json({ examName: exam.name, maxScore: exam.maxScore, roster });
});

// ---------- Teacher: record/update a result for one student on one of my exams ----------
router.post('/assessments/:examId/results', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { examId } = req.params;
  const { studentId, score, remarks } = req.body;

  if (!studentId || score === undefined || score === null) {
    return res.status(400).json({ error: 'studentId and score are required' });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return res.status(404).json({ error: 'Assessment not found' });

  const assignment = await prisma.unitLecturer.findFirst({
    where: { lecturerId: req.user!.userId, unitId: exam.unitId, termId: exam.termId },
  });
  if (!assignment) {
    return res.status(403).json({ error: 'You do not teach the unit for this assessment' });
  }

  const result = await prisma.examResult.upsert({
    where: { examId_studentId: { examId, studentId } },
    update: { score, remarks: remarks || null, recordedById: req.user!.userId },
    create: { examId, studentId, score, remarks: remarks || null, recordedById: req.user!.userId },
  });

  res.json(result);
});

// ---------- Teacher: read-only results overview across my units this term ----------
router.get('/results', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, exams: [] });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
  });
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return res.json({ term: term.name, exams: [] });

  const exams = await prisma.exam.findMany({
    where: { unitId: { in: unitIds }, termId: term.id },
    include: {
      unit: true,
      results: { include: { student: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = exams.map((e) => ({
    id: e.id,
    name: e.name,
    unitName: e.unit.name,
    maxScore: e.maxScore,
    results: e.results.map((r) => ({ studentName: r.student.name, score: r.score, remarks: r.remarks })),
  }));

  res.json({ term: term.name, exams: shaped });
});

// ---------- Teacher: my classes (programme/cohort rollup of my units) ----------
router.get('/classes', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json({ term: null, classes: [] });

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
    include: { unit: { include: { program: true } } },
  });

  if (assignments.length === 0) return res.json({ term: term.name, classes: [] });

  const unitIds = assignments.map((a) => a.unitId);
  const registrations = await prisma.unitRegistration.findMany({
    where: { unitId: { in: unitIds }, termId: term.id, status: 'REGISTERED' },
    select: { unitId: true, studentId: true },
  });

  const programMap = new Map<
    string,
    { programId: string; programName: string; programLevel: string | null; units: Set<string>; studentIds: Set<string> }
  >();

  for (const a of assignments) {
    const key = a.unit.program.id;
    if (!programMap.has(key)) {
      programMap.set(key, {
        programId: key,
        programName: a.unit.program.name,
        programLevel: a.unit.program.level,
        units: new Set(),
        studentIds: new Set(),
      });
    }
    programMap.get(key)!.units.add(a.unit.name);
  }

  for (const r of registrations) {
    const assignment = assignments.find((a) => a.unitId === r.unitId);
    if (!assignment) continue;
    programMap.get(assignment.unit.program.id)!.studentIds.add(r.studentId);
  }

  const classes = Array.from(programMap.values()).map((p) => ({
    programId: p.programId,
    programName: p.programName,
    programLevel: p.programLevel,
    units: Array.from(p.units),
    studentCount: p.studentIds.size,
  }));

  res.json({ term: term.name, classes });
});

export default router;
