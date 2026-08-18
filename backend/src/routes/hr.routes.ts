import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- HR/Admin: list staff profiles ----------
router.get('/staff', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const staff = await prisma.staffProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(staff);
});

// ---------- HR/Admin: get a single staff profile ----------
router.get('/staff/:id', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const staff = await prisma.staffProfile.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
  });

  if (!staff) return res.status(404).json({ error: 'Staff profile not found' });
  res.json(staff);
});

// ---------- HR/Admin: create a staff profile for an existing user ----------
router.post('/staff', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const { userId, employeeNumber, position, employmentType, dateHired, nationalId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = await prisma.staffProfile.findUnique({ where: { userId } });
  if (existing) return res.status(409).json({ error: 'This user already has a staff profile' });

  const staff = await prisma.staffProfile.create({
    data: {
      userId,
      employeeNumber: employeeNumber || null,
      position: position || null,
      employmentType: employmentType || 'FULL_TIME',
      dateHired: dateHired ? new Date(dateHired) : null,
      nationalId: nationalId || null,
    },
  });

  res.status(201).json(staff);
});

// ---------- HR/Admin: update a staff profile ----------
router.patch('/staff/:id', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const { position, employmentType, dateHired, nationalId, status } = req.body;

  const staff = await prisma.staffProfile.update({
    where: { id: req.params.id },
    data: {
      ...(position !== undefined ? { position } : {}),
      ...(employmentType !== undefined ? { employmentType } : {}),
      ...(dateHired !== undefined ? { dateHired: dateHired ? new Date(dateHired) : null } : {}),
      ...(nationalId !== undefined ? { nationalId } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  res.json(staff);
});

// ---------- HR/Admin: list leave requests (optionally filter by status) ----------
router.get('/leave-requests', requireAuth, requireRole('HR_OFFICER', 'ADMIN'), async (req, res) => {
  const { status } = req.query as { status?: string };

  const requests = await prisma.leaveRequest.findMany({
    where: status ? { status: status as any } : {},
    include: {
      staff: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
});

// ---------- Any authenticated staff member: submit a leave request ----------
router.post('/leave-requests', requireAuth, async (req, res) => {
  const { type, startDate, endDate, reason } = req.body;

  if (!type || !startDate || !endDate) {
    return res.status(400).json({ error: 'type, startDate and endDate are required' });
  }

  const request = await prisma.leaveRequest.create({
    data: {
      staffId: req.user!.userId,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason || null,
    },
  });

  res.status(201).json(request);
});

// ---------- Staff: view own leave requests ----------
router.get('/my-leave-requests', requireAuth, async (req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { staffId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
});

// ---------- HR/Admin: approve or reject a leave request ----------
router.patch(
  '/leave-requests/:id/decision',
  requireAuth,
  requireRole('HR_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { decision } = req.body; // 'APPROVED' | 'REJECTED'

    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ error: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    const request = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: decision, approvedById: req.user!.userId },
    });

    res.json(request);
  }
);

export default router;
