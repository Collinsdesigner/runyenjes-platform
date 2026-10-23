// NOTIFICATIONS_ROUTE_V1
// Bell notifications, computed from data that already exists.
// Nothing here is stored, so there is no table and no migration.
import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

const WINDOW_DAYS = 14;
const MAX_ITEMS = 15;

// Where each approver role does its approvals. A role not listed here still
// gets the count, linked to the home page.
const APPROVALS_LINK: Record<string, string> = {
  FINANCE: '/finance/approvals',
  REGISTRAR: '/registrar/approvals',
};

interface NotificationItem {
  id: string;
  // 'action' = something waiting for you (stays counted until it is done)
  // 'info'   = something new to read (counted until you open the bell)
  kind: 'info' | 'action';
  title: string;
  detail?: string;
  link: string;
  at: string;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const role = String(req.user!.role);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const nowIso = new Date().toISOString();
    const items: NotificationItem[] = [];

    // 1. Applications waiting for review (registrar and admin)
    if (role === 'ADMIN' || role === 'REGISTRAR') {
      const pending = await prisma.application.count({ where: { status: 'SUBMITTED' } });
      if (pending > 0) {
        items.push({
          id: 'pending-applications',
          kind: 'action',
          title: `${pending} ${pending === 1 ? 'application' : 'applications'} awaiting review`,
          link: role === 'ADMIN' ? '/admin/admissions' : '/admissions',
          at: nowIso,
        });
      }
    }

    // 2. Requests waiting for this role's decision (same rule as the approvals inbox)
    const waiting = await prisma.request.findMany({
      where: {
        status: 'PENDING',
        stages: { some: { approverRole: role as Role, status: 'PENDING' } },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    const myTurn = waiting.filter((r) => r.stages[r.currentStage]?.approverRole === role);
    if (myTurn.length > 0) {
      items.push({
        id: 'pending-approvals',
        kind: 'action',
        title: `${myTurn.length} ${myTurn.length === 1 ? 'request' : 'requests'} awaiting your decision`,
        link: APPROVALS_LINK[role] || '/',
        at: nowIso,
      });
    }

    // 3. A student's own requests that were decided recently
    if (role === 'STUDENT') {
      const decided = await prisma.request.findMany({
        where: {
          submitterId: userId,
          status: { notIn: ['PENDING', 'CANCELLED'] },
          updatedAt: { gte: since },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, type: true, status: true, updatedAt: true },
      });
      for (const r of decided) {
        items.push({
          id: `request-${r.id}-${r.updatedAt.getTime()}`,
          kind: 'info',
          title: `Your ${humanize(String(r.type))} request was ${humanize(String(r.status))}`,
          link: '/student/requests',
          at: r.updatedAt.toISOString(),
        });
      }
    }

    // 4. Recent announcements (not your own)
    const announcements = await prisma.announcement.findMany({
      where: { createdAt: { gte: since }, postedById: { not: userId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, createdAt: true },
    });
    for (const a of announcements) {
      items.push({
        id: `announcement-${a.id}`,
        kind: 'info',
        title: a.title,
        detail: 'New announcement',
        link: '/announcements',
        at: a.createdAt.toISOString(),
      });
    }

    // Things waiting for you first, then newest first.
    items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'action' ? -1 : 1;
      return b.at.localeCompare(a.at);
    });

    res.json({ items: items.slice(0, MAX_ITEMS) });
  } catch (err) {
    console.error('notifications failed', err);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

export default router;
