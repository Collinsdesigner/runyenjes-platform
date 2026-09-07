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

export default router;
