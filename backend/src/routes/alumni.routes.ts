import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Registrar/Admin: graduate a student (STUDENT -> ALUMNI) ----------
// Converts the existing student account rather than creating a new identity,
// so all their enrollment/academic history stays attached to the same user.
router.post(
  '/graduate/:studentId',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { studentId } = req.params;
    const { graduationYear } = req.body;

    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Student not found' });
    }

    const existingProfile = await prisma.alumniProfile.findUnique({ where: { userId: studentId } });
    if (existingProfile) {
      return res.status(409).json({ error: 'This student has already been graduated to Alumni' });
    }

    const [updatedUser, profile] = await prisma.$transaction([
      prisma.user.update({ where: { id: studentId }, data: { role: 'ALUMNI' } }),
      prisma.alumniProfile.create({
        data: { userId: studentId, graduationYear: graduationYear ? Number(graduationYear) : null },
      }),
    ]);

    res.status(201).json({ user: updatedUser, profile });
  }
);

// ---------- Alumnus: view own alumni profile ----------
router.get('/profile', requireAuth, requireRole('ALUMNI'), async (req, res) => {
  const profile = await prisma.alumniProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ error: 'Alumni profile not found' });
  res.json(profile);
});

// ---------- Alumnus: update own current employer/position ----------
router.patch('/profile', requireAuth, requireRole('ALUMNI'), async (req, res) => {
  const { currentEmployer, currentPosition } = req.body;

  const profile = await prisma.alumniProfile.update({
    where: { userId: req.user!.userId },
    data: {
      ...(currentEmployer !== undefined ? { currentEmployer } : {}),
      ...(currentPosition !== undefined ? { currentPosition } : {}),
    },
  });

  res.json(profile);
});

// ---------- Registrar/Admin: list all alumni ----------
router.get('/', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const alumni = await prisma.alumniProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, admissionNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(alumni);
});

export default router;
