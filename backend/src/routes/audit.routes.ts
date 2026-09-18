import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Admin: view the audit log (optionally filtered, paginated) ----------
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { entityType, actorId, page, pageSize } = req.query as {
    entityType?: string;
    actorId?: string;
    page?: string;
    pageSize?: string;
  };

  const take = Math.min(Number(pageSize) || 50, 200);
  const skip = ((Number(page) || 1) - 1) * take;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(actorId ? { actorId } : {}),
      },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.count({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(actorId ? { actorId } : {}),
      },
    }),
  ]);

  res.json({ entries, total, page: Number(page) || 1, pageSize: take });
});

export default router;
