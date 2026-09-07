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

export default router;
