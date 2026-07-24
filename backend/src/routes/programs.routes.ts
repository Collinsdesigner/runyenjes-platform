import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Public — used by the application form to populate department/program choices,
// and by the Library/class-group pages later.
router.get('/', async (req, res) => {
  const departments = await prisma.department.findMany({
    include: {
      programs: {
        select: {
          id: true,
          name: true,
          level: true,
          entryRequirements: true,
          examBody: true,
          isShortCourse: true,
          fees: { orderBy: { effectiveFrom: 'desc' }, take: 1, select: { amount: true, effectiveFrom: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Flatten "fees: [latest]" into a simple currentFee field for the frontend
  const shaped = departments.map((dept) => ({
    ...dept,
    programs: dept.programs.map((p) => ({
      ...p,
      currentFee: p.fees[0]?.amount ?? null,
      fees: undefined,
    })),
  }));

  res.json(shaped);
});

export default router;
