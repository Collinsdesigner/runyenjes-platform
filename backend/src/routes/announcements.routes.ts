import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Only Registrar/Admin can post announcements.
const CAN_POST = ['REGISTRAR', 'ADMIN'];

// ---------- Any authenticated user: read every announcement ----------
router.get('/', requireAuth, async (req, res) => {
  const announcements = await prisma.announcement.findMany({
    include: { postedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(announcements);
});

// ---------- Registrar/Admin: post an announcement ----------
router.post('/', requireAuth, async (req, res) => {
  if (!CAN_POST.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Registrar or Admin can post announcements' });
  }

  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      postedById: req.user!.userId,
    },
  });

  res.status(201).json(announcement);
});

// ---------- Poster or Admin: delete an announcement ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

  const isOwner = announcement.postedById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own announcements' });
  }

  await prisma.announcement.delete({ where: { id } });
  res.status(204).send();
});

export default router;
