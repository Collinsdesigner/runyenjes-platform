import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { deleteImage } from '../services/media.service';
import { recordVisit } from '../services/visitCounter.service';

const router = Router();

// ---------- View the Home feed (anyone, no login needed) ----------
// LIKED_BY_NAMES_V1
router.get('/', optionalAuth, async (req, res) => {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      author: { select: { name: true, role: true, avatarUrl: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { name: true, avatarUrl: true } } },
      },
      likes: {
        select: {
          userId: true,
          guestName: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  // Reshape likes into a count, "did the current viewer like this" flag, and
  // a plain list of who liked it (member name or guest display name) --
  // without exposing raw user/guest ids to the client.
  const shaped = posts.map((p) => ({
    ...p,
    likeCount: p.likes.length,
    likedByMe: req.user ? p.likes.some((l) => l.userId === req.user!.userId) : false,
    likedByNames: p.likes.map((l) => l.user?.name || l.guestName || 'A visitor').slice(0, 50),
    likes: undefined,
  }));

  // Anonymous visit counter — no identity stored, just a number
  // VISIT_STATS_V1 -- resets weekly, see services/visitCounter.service.ts
  if (!req.user) {
    await recordVisit();
  }

  res.json(shaped);
});

// ---------- Create a post (logged-in members only — students, teachers, admins) ----------
router.post('/', requireAuth, async (req, res) => {
const { content, mediaUrl, mediaPublicId } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Post content cannot be empty' });
  }

  const post = await prisma.post.create({
    data: {
      authorId: req.user!.userId,
      content: content.trim(),
      mediaUrl: mediaUrl || null,
      mediaPublicId: mediaPublicId || null,
    },
    include: { author: { select: { name: true, role: true, avatarUrl: true } } },
  });

  res.status(201).json(post);
});

// ---------- Reply to a post (anyone — logged-in members OR public guests) ----------
router.post('/:postId/comments', optionalAuth, async (req, res) => {
  const { postId } = req.params;
  const { content, guestName } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Reply cannot be empty' });
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // If not logged in, require at least a display name so replies aren't fully anonymous
  if (!req.user && (!guestName || !guestName.trim())) {
    return res.status(400).json({ error: 'Please provide your name to reply' });
  }

  const comment = await prisma.comment.create({
    data: {
      postId,
      authorId: req.user ? req.user.userId : null,
      authorNamePublic: req.user ? null : guestName.trim(),
      content: content.trim(),
    },
    include: { author: { select: { name: true, avatarUrl: true } } },
  });

  res.status(201).json(comment);
});

// ---------- Delete a comment (the author, or an Admin/Founder moderating) ----------
router.delete('/:postId/comments/:commentId', requireAuth, async (req, res) => {
  const { commentId } = req.params;

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const isAuthor = comment.authorId === req.user!.userId;
const isModerator = req.user!.role === 'ADMIN';
  if (!isAuthor && !isModerator) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }

  await prisma.comment.delete({ where: { id: commentId } });
  res.status(204).send();
});


// ---------- Toggle like on a post (members + visitors) ----------
router.post('/:postId/like', async (req, res) => {
  const { postId } = req.params;
  const { guestId, guestName } = req.body;
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const userId = req.user?.userId ?? null;

if (!userId && !guestId) {
    return res.status(400).json({
      error: 'Please provide your name before liking',
    });
  }

const existing = await prisma.postLike.findFirst({
  where: userId
    ? { postId, userId }
    : { postId, guestId },
});
  if (existing) {
    await prisma.postLike.delete({
      where: { id: existing.id },
    });

    const likeCount = await prisma.postLike.count({
      where: { postId },
    });

    return res.json({
      liked: false,
      likeCount,
    });
  }

await prisma.postLike.create({
  data: {
    postId,
    userId,
    guestId: userId ? null : guestId,
    guestName: userId ? null : guestName,
  },
});
  const likeCount = await prisma.postLike.count({
    where: { postId },
  });

  res.json({
    liked: true,
    likeCount,
  });
});


// ---------- Delete a post (the author, or an Admin/Founder moderating) ----------
router.delete('/:postId', requireAuth, async (req, res) => {
  const { postId } = req.params;

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const isAuthor = post.authorId === req.user!.userId;
  const isModerator = ['ADMIN'].includes(req.user!.role);
  if (!isAuthor && !isModerator) {
    return res.status(403).json({ error: 'You can only delete your own posts' });
  }

if (post.mediaPublicId) {
  try {
    await deleteImage(post.mediaPublicId);
  } catch (error) {
    console.error('Failed to delete image from Cloudinary:', error);
  }
}

await prisma.comment.deleteMany({ where: { postId } });
await prisma.postLike.deleteMany({ where: { postId } });
await prisma.post.delete({ where: { id: postId } });
  res.status(204).send();
});

export default router;
