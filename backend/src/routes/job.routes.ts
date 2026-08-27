import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ---------- Any authenticated staff member or alumnus: post a job opening ----------
// Students cannot post -- everyone else (staff of any kind, or Alumni) can.
router.post('/', requireAuth, async (req, res) => {
  if (req.user!.role === 'STUDENT') {
    return res.status(403).json({ error: 'Students cannot post job openings' });
  }

  const { title, company, location, description, applyLink, contactEmail } = req.body;

  if (!title || !company || !description) {
    return res.status(400).json({ error: 'title, company and description are required' });
  }

  const posting = await prisma.jobPosting.create({
    data: {
      title,
      company,
      location: location || null,
      description,
      applyLink: applyLink || null,
      contactEmail: contactEmail || null,
      postedById: req.user!.userId,
    },
  });

  res.status(201).json(posting);
});

// ---------- Alumni/Admin: browse open postings ----------
router.get('/', requireAuth, async (req, res) => {
  if (req.user!.role !== 'ALUMNI' && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only Alumni can browse the job board' });
  }

  const { status } = req.query as { status?: string };
  const isAdmin = req.user!.role === 'ADMIN';

  // Admin sees every posting by default (for moderation), optionally
  // filtered to a specific status. Alumni only ever see OPEN postings.
  const where = isAdmin ? (status ? { status: status as any } : {}) : { status: 'OPEN' as const };

  const postings = await prisma.jobPosting.findMany({
    where,
    include: { postedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(postings);
});

// ---------- Poster: view own postings, any status ----------
router.get('/my-postings', requireAuth, async (req, res) => {
  const postings = await prisma.jobPosting.findMany({
    where: { postedById: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(postings);
});

// ---------- Poster or Admin: open/close a listing ----------
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'OPEN' | 'CLOSED'

  if (status !== 'OPEN' && status !== 'CLOSED') {
    return res.status(400).json({ error: "status must be 'OPEN' or 'CLOSED'" });
  }

  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting) return res.status(404).json({ error: 'Posting not found' });

  const isOwner = posting.postedById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own postings' });
  }

  const updated = await prisma.jobPosting.update({ where: { id }, data: { status } });
  res.json(updated);
});

// ---------- Poster or Admin: delete a listing ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting) return res.status(404).json({ error: 'Posting not found' });

  const isOwner = posting.postedById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own postings' });
  }

  await prisma.jobPosting.delete({ where: { id } });
  res.status(204).send();
});

export default router;
