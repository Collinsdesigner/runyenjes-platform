import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ---------- Get my own profile ----------
router.get('/me', requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      role: true,
      admissionNumber: true,
      department: { select: { name: true } },
    },
  });
  res.json(me);
});

// ---------- Update my own profile picture ----------
// The frontend first uploads the image file via POST /uploads (which returns a URL),
// then calls this with that URL to attach it to the account.
router.patch('/avatar', requireAuth, async (req, res) => {
  const { avatarUrl } = req.body;
  if (!avatarUrl) return res.status(400).json({ error: 'avatarUrl is required' });

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { avatarUrl },
    select: { id: true, name: true, avatarUrl: true },
  });

  res.json(user);
});

export default router;
