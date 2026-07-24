import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ---------- List the groups the logged-in user belongs to ----------
router.get('/', requireAuth, async (req, res) => {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: req.user!.userId },
    include: {
      group: {
        include: {
          program: { select: { name: true, level: true } },
          department: { select: { name: true } },
        },
      },
    },
  });

  const groups = memberships.map((m) => m.group);
  res.json(groups);
});

// ---------- Get messages for a specific group (must be a member) ----------
router.get('/:groupId/messages', requireAuth, async (req, res) => {
  const { groupId } = req.params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.user!.userId } },
  });
  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const messages = await prisma.message.findMany({
    where: { groupId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { sender: { select: { name: true, role: true, avatarUrl: true } } },
  });

  res.json(messages);
});

// ---------- Send a message to a group (must be a member) ----------
router.post('/:groupId/messages', requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const { content, attachmentUrl } = req.body;

  if ((!content || !content.trim()) && !attachmentUrl) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.user!.userId } },
  });
  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const message = await prisma.message.create({
    data: { groupId, senderId: req.user!.userId, content: content?.trim() || '', attachmentUrl: attachmentUrl || null },
    include: { sender: { select: { name: true, role: true, avatarUrl: true } } },
  });

  res.status(201).json(message);
});

// ---------- Delete a message (the sender, or a Teacher/Admin/Founder moderating the group) ----------
router.delete('/:groupId/messages/:messageId', requireAuth, async (req, res) => {
  const { groupId, messageId } = req.params;

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.groupId !== groupId) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const isSender = message.senderId === req.user!.userId;
  const isPlatformModerator = ['ADMIN', 'FOUNDER'].includes(req.user!.role);

  let isTeacherModerator = false;
  if (!isSender && !isPlatformModerator && req.user!.role === 'TEACHER') {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user!.userId } },
    });
    isTeacherModerator = Boolean(membership);
  }

  if (!isSender && !isPlatformModerator && !isTeacherModerator) {
    return res.status(403).json({ error: 'You can only delete your own messages' });
  }

  await prisma.message.delete({ where: { id: messageId } });
  res.status(204).send();
});

export default router;
