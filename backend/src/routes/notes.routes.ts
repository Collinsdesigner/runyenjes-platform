import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Every route here is scoped to the requesting user's own notes only --
// there is no sharing/visibility concept in v1.

// ---------- List own notes ----------
router.get('/', requireAuth, async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: 'desc' },
  });

  res.json(notes);
});

// ---------- Create a note ----------
router.post('/', requireAuth, async (req, res) => {
  const { title, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const note = await prisma.note.create({
    data: {
      userId: req.user!.userId,
      title: title || 'Untitled note',
      content,
    },
  });

  res.status(201).json(note);
});

// ---------- Update own note ----------
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'You can only edit your own notes' });
  }

  const updated = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
  });

  res.json(updated);
});

// ---------- Delete own note ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'You can only delete your own notes' });
  }

  await prisma.note.delete({ where: { id } });
  res.status(204).send();
});

export default router;
