// STORIES_ROUTE_V1
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { deleteImage } from '../services/media.service';

const router = Router();

// Who may post a story. Everyone (including guests) can VIEW; students and
// other roles cannot post. Change this one list to widen or narrow it.
const CAN_POST = ['TEACHER', 'REGISTRAR', 'ADMIN'];

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_STORY_LENGTH = 500;

// Expired stories are removed lazily (no cron needed -- free-tier hosts sleep).
// At most once per interval, the next feed request cleans up whatever expired.
const CLEANUP_EVERY_MS = 10 * 60 * 1000;
let lastCleanup = 0;

async function purgeExpiredStories() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;

  try {
    const expired = await prisma.story.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, mediaPublicId: true },
      take: 100,
    });
    if (expired.length === 0) return;

    for (const s of expired) {
      if (s.mediaPublicId) {
        try {
          await deleteImage(s.mediaPublicId);
        } catch (error) {
          console.error('Failed to delete expired story image from Cloudinary:', error);
        }
      }
    }

    await prisma.story.deleteMany({
      where: { id: { in: expired.map((s) => s.id) } },
    });
  } catch (error) {
    console.error('Story cleanup failed:', error);
  }
}

// ---------- Anyone (guests included): active stories only ----------
router.get('/', async (_req, res) => {
  try {
    const stories = await prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        content: true,
        mediaUrl: true,
        createdAt: true,
        expiresAt: true,
        authorId: true,
        author: { select: { id: true, name: true, role: true, avatarUrl: true } },
      },
    });

    res.json(stories);
  } catch (error) {
    console.error('Could not load stories:', error);
    res.status(500).json({ error: 'Could not load stories' });
    return;
  }

  void purgeExpiredStories();
});

// ---------- Teacher / Registrar / Admin: post a story ----------
router.post('/', requireAuth, async (req, res) => {
  if (!CAN_POST.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only teachers, the registrar or admin can post stories' });
  }

  const { content, mediaUrl, mediaPublicId } = req.body;
  const text = typeof content === 'string' ? content.trim() : '';
  const media = typeof mediaUrl === 'string' ? mediaUrl.trim() : '';

  if (!text && !media) {
    return res.status(400).json({ error: 'A story needs some text or an image' });
  }
  if (text.length > MAX_STORY_LENGTH) {
    return res.status(400).json({ error: `Stories are limited to ${MAX_STORY_LENGTH} characters` });
  }
  if (media && !/^https:\/\//i.test(media)) {
    return res.status(400).json({ error: 'Image link must be a secure (https) URL' });
  }

  try {
    const story = await prisma.story.create({
      data: {
        authorId: req.user!.userId,
        content: text,
        mediaUrl: media || null,
        mediaPublicId: typeof mediaPublicId === 'string' && mediaPublicId ? mediaPublicId : null,
        expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
      },
      select: {
        id: true,
        content: true,
        mediaUrl: true,
        createdAt: true,
        expiresAt: true,
        authorId: true,
        author: { select: { id: true, name: true, role: true, avatarUrl: true } },
      },
    });

    res.status(201).json(story);
  } catch (error) {
    console.error('Could not create story:', error);
    res.status(500).json({ error: 'Could not create story' });
  }
});

// ---------- Poster or Admin: delete a story (works even if just expired) ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) return res.status(404).json({ error: 'Story not found' });

    const isOwner = story.authorId === req.user!.userId;
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own stories' });
    }

    if (story.mediaPublicId) {
      try {
        await deleteImage(story.mediaPublicId);
      } catch (error) {
        console.error('Failed to delete story image from Cloudinary:', error);
      }
    }

    await prisma.story.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Could not delete story:', error);
    res.status(500).json({ error: 'Could not delete story' });
  }
});

export default router;
