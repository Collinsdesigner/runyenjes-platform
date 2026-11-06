// POE_ROUTES_V1
import { Router } from 'express';
import cloudinary from '../services/media.service';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logAudit } from '../services/audit.service';
import * as zodLib from 'zod';
const z = zodLib.z;

const router = Router();

// The student's phone calls this, then uploads straight to Cloudinary with the result.
// Limits (5 MB image, 50 MB or 60 s video) are checked again when the evidence is attached.
router.post('/upload-signature', requireAuth, requireRole('STUDENT'), (req, res) => {
  const kind = req.body?.kind === 'VIDEO' ? 'video' : 'image';
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `poe/${req.user!.userId}`;
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, process.env.CLOUDINARY_API_SECRET || '');
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
    resourceType: kind,
  });
});

// POE_STUDENT_V1
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 180;
const MAX_MEDIA_PER_ENTRY = 6;
const EDITABLE = ['DRAFT', 'RESUBMIT_REQUESTED'];

const entrySchema = z.object({
  unitId: z.string().min(1),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).optional(),
  performedOn: z.coerce.date(),
});

const mediaSchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO']),
  publicId: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  bytes: z.number().int().positive(),
  durationSeconds: z.number().int().positive().optional(),
});

router.get('/my/units', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const regs = await prisma.unitRegistration.findMany({
    where: { studentId: req.user!.userId, status: { not: 'DROPPED' } },
    select: { unit: { select: { id: true, name: true } } },
  });
  const seen = new Map<string, { id: string; name: string }>();
  for (const r of regs) seen.set(r.unit.id, r.unit);
  res.json({ units: Array.from(seen.values()) });
});

router.get('/my', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const entries = await prisma.poeEntry.findMany({
    where: { studentId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    include: { media: true, unit: { select: { id: true, name: true } } },
  });
  res.json({ entries });
});

router.post('/entries', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the title (3 to 150 characters), unit and date' });
  const { unitId, title, description, performedOn } = parsed.data;
  const reg = await prisma.unitRegistration.findFirst({
    where: { studentId: req.user!.userId, unitId, status: { not: 'DROPPED' } },
  });
  if (!reg) return res.status(403).json({ error: 'You are not registered for this unit' });
  const entry = await prisma.poeEntry.create({
    data: { studentId: req.user!.userId, unitId, title, description, performedOn },
  });
  res.status(201).json(entry);
});

router.post('/entries/:id/media', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const parsed = mediaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid file details' });
  const m = parsed.data;
  const userId = req.user!.userId;

  const entry = await prisma.poeEntry.findUnique({ where: { id: req.params.id }, include: { media: true } });
  if (!entry || entry.studentId !== userId) return res.status(404).json({ error: 'Entry not found' });
  if (!EDITABLE.includes(entry.status)) return res.status(409).json({ error: 'This entry can no longer be changed' });

  if (!m.publicId.startsWith(`poe/${userId}/`)) return res.status(400).json({ error: 'File is not in your folder' });
  if (!m.url.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`)) {
    return res.status(400).json({ error: 'File is not from the college storage' });
  }
  if (m.kind === 'IMAGE' && m.bytes > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'Photo is larger than 5 MB' });
  if (m.kind === 'VIDEO') {
    if (m.bytes > MAX_VIDEO_BYTES) return res.status(400).json({ error: 'Video is larger than 50 MB' });
    if ((m.durationSeconds ?? 0) > MAX_VIDEO_SECONDS) return res.status(400).json({ error: 'Video is longer than 3 minutes' });
    if (entry.media.some((x) => x.kind === 'VIDEO')) return res.status(400).json({ error: 'Only one video per entry' });
  }
  if (entry.media.length >= MAX_MEDIA_PER_ENTRY) return res.status(400).json({ error: 'Maximum 6 files per entry' });

  const media = await prisma.poeMedia.create({ data: { entryId: entry.id, ...m } });
  res.status(201).json(media);
});

router.delete('/entries/:id/media/:mediaId', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const media = await prisma.poeMedia.findUnique({ where: { id: req.params.mediaId }, include: { entry: true } });
  if (!media || media.entryId !== req.params.id || media.entry.studentId !== req.user!.userId) {
    return res.status(404).json({ error: 'File not found' });
  }
  if (!EDITABLE.includes(media.entry.status)) return res.status(409).json({ error: 'This entry can no longer be changed' });
  await prisma.poeMedia.delete({ where: { id: media.id } });
  try {
    await cloudinary.uploader.destroy(media.publicId, { resource_type: media.kind === 'VIDEO' ? 'video' : 'image' });
  } catch (e) {
    console.error('POE media cleanup failed:', e);
  }
  res.json({ ok: true });
});

router.delete('/entries/:id', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const entry = await prisma.poeEntry.findUnique({ where: { id: req.params.id }, include: { media: true } });
  if (!entry || entry.studentId !== req.user!.userId) return res.status(404).json({ error: 'Entry not found' });
  if (![...EDITABLE, 'SUBMITTED'].includes(entry.status)) return res.status(409).json({ error: 'Entries that have been marked cannot be deleted' });
  await prisma.poeEntry.delete({ where: { id: entry.id } });
  for (const m of entry.media) {
    try {
      await cloudinary.uploader.destroy(m.publicId, { resource_type: m.kind === 'VIDEO' ? 'video' : 'image' });
    } catch (e) {
      console.error('POE media cleanup failed:', e);
    }
  }
  res.json({ ok: true });
});

router.post('/entries/:id/submit', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const entry = await prisma.poeEntry.findUnique({ where: { id: req.params.id }, include: { media: true } });
  if (!entry || entry.studentId !== req.user!.userId) return res.status(404).json({ error: 'Entry not found' });
  if (!EDITABLE.includes(entry.status)) return res.status(409).json({ error: 'Already submitted' });
  if (entry.media.length === 0) return res.status(400).json({ error: 'Add at least one photo or video first' });
  const updated = await prisma.poeEntry.update({
    where: { id: entry.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
  await logAudit({
    actorId: req.user!.userId,
    action: 'POE_SUBMITTED',
    entityType: 'PoeEntry',
    entityId: entry.id,
    before: { status: entry.status },
    after: { status: updated.status },
  });
  res.json(updated);
});

// POE_TEACHER_V1
async function teacherUnitIds(userId: string): Promise<string[]> {
  const rows = await prisma.unitLecturer.findMany({ where: { lecturerId: userId }, select: { unitId: true } });
  return Array.from(new Set(rows.map((r) => r.unitId)));
}

const assessSchema = z.object({
  decision: z.enum(['COMPETENT', 'NOT_YET_COMPETENT', 'RESUBMIT_REQUESTED']),
  feedback: z.string().trim().max(2000).optional(),
});

router.get('/pending', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const ids = await teacherUnitIds(req.user!.userId);
  const entries = await prisma.poeEntry.findMany({
    where: { unitId: { in: ids }, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'asc' },
    include: {
      media: true,
      unit: { select: { id: true, name: true } },
      student: { select: { id: true, name: true, admissionNumber: true } },
    },
  });
  res.json({ entries });
});

router.post('/entries/:id/assess', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const parsed = assessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid decision' });
  const { decision, feedback } = parsed.data;
  if (decision !== 'COMPETENT' && !feedback) return res.status(400).json({ error: 'Please write feedback for the student' });
  const entry = await prisma.poeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const ids = await teacherUnitIds(req.user!.userId);
  if (!ids.includes(entry.unitId)) return res.status(403).json({ error: 'You are not assigned to this unit' });
  if (entry.status !== 'SUBMITTED') return res.status(409).json({ error: 'This entry is not waiting for marking' });
  const updated = await prisma.poeEntry.update({
    where: { id: entry.id },
    data: { status: decision, assessedById: req.user!.userId, assessedAt: new Date(), assessorFeedback: feedback || null },
  });
  await logAudit({
    actorId: req.user!.userId,
    action: 'POE_ASSESSED',
    entityType: 'PoeEntry',
    entityId: entry.id,
    before: { status: entry.status },
    after: { status: updated.status, feedback: feedback || null },
  });
  res.json(updated);
});

export default router;


