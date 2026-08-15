import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Public: see the currently active term (so the frontend knows what to show) ----------
router.get('/active', async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  res.json(term);
});

// ---------- Admin/Founder: open a new term (deactivates any previous active term) ----------
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate) {
    return res.status(400).json({ error: 'Term name and start date are required' });
  }

  const existing = await prisma.term.findUnique({ where: { name } });
  if (existing) {
    // Term already exists — just make it the active one instead of erroring
    await prisma.term.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const reactivated = await prisma.term.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
    return res.json(reactivated);
  }

  await prisma.term.updateMany({ where: { isActive: true }, data: { isActive: false } });

  const term = await prisma.term.create({
    data: { name, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : null, isActive: true },
  });

  res.status(201).json(term);
});

// ---------- Student: confirm continuation for the active term ----------
// Requires the student to re-type their own admission number as a deliberate
// confirmation step, not just a single click from an already-open session.
router.post('/confirm', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const { admissionNumber } = req.body;
  if (!admissionNumber || !admissionNumber.trim()) {
    return res.status(400).json({ error: 'Please enter your admission number to confirm' });
  }

  const self = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!self || self.admissionNumber !== admissionNumber.trim()) {
    return res.status(400).json({ error: 'Admission number does not match our records' });
  }

  const activeTerm = await prisma.term.findFirst({ where: { isActive: true } });
  if (!activeTerm) return res.status(400).json({ error: 'No active term is open right now' });

  const checkIn = await prisma.continuationCheckIn.upsert({
    where: { termId_userId: { termId: activeTerm.id, userId: req.user!.userId } },
    update: { status: 'CONFIRMED', confirmedAt: new Date() },
    create: {
      termId: activeTerm.id,
      userId: req.user!.userId,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });

  res.json(checkIn);
});

// ---------- Registrar/Admin/Founder: see who has/hasn't confirmed for the active term ----------
router.get(
  '/status',
  requireAuth,
requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const activeTerm = await prisma.term.findFirst({ where: { isActive: true } });
    if (!activeTerm) return res.status(404).json({ error: 'No active term' });

    const allStudents = await prisma.user.findMany({
      where: { role: 'STUDENT', status: 'ACTIVE' },
      select: { id: true, name: true, email: true, admissionNumber: true },
    });

    const checkIns = await prisma.continuationCheckIn.findMany({
      where: { termId: activeTerm.id },
    });
    const checkInByUser = new Map(checkIns.map((c) => [c.userId, c]));

    const roster = allStudents.map((s) => ({
      ...s,
      status: checkInByUser.get(s.id)?.status ?? 'PENDING',
      confirmedAt: checkInByUser.get(s.id)?.confirmedAt ?? null,
    }));

    res.json({ term: activeTerm, roster });
  }
);

// ---------- Registrar/Admin/Founder: confirm continuation on a student's behalf ----------
// For students who reported in person, called in, or otherwise can't self-confirm online.
router.post(
  '/confirm-for/:userId',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { userId } = req.params;

    const activeTerm = await prisma.term.findFirst({ where: { isActive: true } });
    if (!activeTerm) return res.status(400).json({ error: 'No active term is open right now' });

    const student = await prisma.user.findUnique({ where: { id: userId } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Student not found' });
    }

    const checkIn = await prisma.continuationCheckIn.upsert({
      where: { termId_userId: { termId: activeTerm.id, userId } },
      update: { status: 'CONFIRMED', confirmedAt: new Date() },
      create: {
        termId: activeTerm.id,
        userId,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });

    res.json(checkIn);
  }
);

export default router;
