import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { generateLetterPdf } from '../services/letter-pdf.service';
import { uploadBuffer } from '../services/media.service';
import { getWorkflow, RequestDocumentContext } from '../config/requestWorkflows.config';
import { Prisma, Role, RequestType } from '@prisma/client';

const router = Router();

// ---------- Student/Alumni: submit a new request ----------
router.post('/', requireAuth, requireRole('STUDENT', 'ALUMNI'), async (req, res) => {
  const { type, payload } = req.body as { type: RequestType; payload?: Record<string, unknown> };

  if (!type || !Object.values(RequestType).includes(type)) {
    return res.status(400).json({ error: 'A valid request type is required.' });
  }

  const workflow = getWorkflow(type);

  if (type === 'GRADUATION') {
    const approvedClearance = await prisma.request.findFirst({
      where: { submitterId: req.user!.userId, type: 'CLEARANCE', status: 'APPROVED' },
    });
    if (!approvedClearance) {
      return res
        .status(400)
        .json({ error: 'An approved Clearance Request is required before requesting graduation.' });
    }
  }

  const request = await prisma.request.create({
    data: {
      type,
      submitterId: req.user!.userId,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
      status: 'PENDING',
      currentStage: 0,
      stages: {
        create: workflow.stages.map((role, order) => ({
          order,
          approverRole: role,
          status: 'PENDING',
        })),
      },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'CREATE_REQUEST',
    entityType: 'Request',
    entityId: request.id,
    after: request,
  });

  res.status(201).json(request);
});

// ---------- Student/Alumni: view own requests ----------
router.get('/mine', requireAuth, requireRole('STUDENT', 'ALUMNI'), async (req, res) => {
  const requests = await prisma.request.findMany({
    where: { submitterId: req.user!.userId },
    include: { stages: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
});

// ---------- Staff: requests currently awaiting MY role's decision ----------
// Any role can hit this route; it's naturally empty unless that role
// appears as the current stage on a pending request.
router.get('/inbox', requireAuth, async (req, res) => {
  const requests = await prisma.request.findMany({
    where: {
      status: 'PENDING',
      stages: { some: { approverRole: req.user!.role as Role, status: 'PENDING' } },
    },
    include: {
      stages: { orderBy: { order: 'asc' } },
      submitter: { select: { id: true, name: true, email: true, admissionNumber: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Only surface requests where it's genuinely this role's turn --
  // i.e. every earlier stage in the chain is already approved.
  const myTurn = requests.filter((r) => r.stages[r.currentStage]?.approverRole === req.user!.role);

  res.json(myTurn);
});

// ---------- Staff: approve the current stage ----------
router.post('/:id/approve', requireAuth, async (req, res) => {
  const result = await decideStage(req.params.id, req.user!.userId, req.user!.role, 'APPROVED', req.body?.comment);
  if (isDecideStageError(result)) return res.status(result.status).json({ error: result.error });
  res.json(result.request);
});

// ---------- Staff: reject the current stage ----------
router.post('/:id/reject', requireAuth, async (req, res) => {
  const result = await decideStage(req.params.id, req.user!.userId, req.user!.role, 'REJECTED', req.body?.comment);
  if (isDecideStageError(result)) return res.status(result.status).json({ error: result.error });
  res.json(result.request);
});

// ---------- Student/Alumni: cancel own pending request ----------
router.post('/:id/cancel', requireAuth, requireRole('STUDENT', 'ALUMNI'), async (req, res) => {
  const request = await prisma.request.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.submitterId !== req.user!.userId) {
    return res.status(403).json({ error: 'You can only cancel your own requests.' });
  }
  if (request.status !== 'PENDING') {
    return res.status(400).json({ error: 'Only pending requests can be cancelled.' });
  }

  const updated = await prisma.request.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });

  await logAudit({
    actorId: req.user!.userId,
    action: 'CANCEL_REQUEST',
    entityType: 'Request',
    entityId: updated.id,
    after: updated,
  });

  res.json(updated);
});

// ============================================================
// Internal helpers
// ============================================================

type DecideStageResult = { error: string; status: number } | { request: Awaited<ReturnType<typeof prisma.request.update>> };

function isDecideStageError(r: DecideStageResult): r is { error: string; status: number } {
  return 'error' in r;
}

async function decideStage(
  requestId: string,
  actorId: string,
  actorRole: string,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string
): Promise<DecideStageResult> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { stages: { orderBy: { order: 'asc' } }, submitter: true },
  });
  if (!request) return { error: 'Request not found.', status: 404 as const };
  if (request.status !== 'PENDING') {
    return { error: 'This request has already been finalized.', status: 400 as const };
  }

  const currentStage = request.stages[request.currentStage];
  if (!currentStage) return { error: 'Request has no pending stage.', status: 400 as const };
  if (currentStage.approverRole !== actorRole) {
    return { error: 'This request is not awaiting your role.', status: 403 as const };
  }

  await prisma.requestStage.update({
    where: { id: currentStage.id },
    data: { status: decision, actedById: actorId, actedAt: new Date(), comment },
  });

  if (decision === 'REJECTED') {
    const updated = await prisma.request.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
    await logAudit({
      actorId,
      action: 'REQUEST_STAGE_REJECTED',
      entityType: 'Request',
      entityId: requestId,
      after: updated,
    });
    return { request: updated };
  }

  const isFinalStage = request.currentStage === request.stages.length - 1;

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: isFinalStage ? { status: 'APPROVED' } : { currentStage: { increment: 1 } },
  });

  await logAudit({
    actorId,
    action: 'REQUEST_STAGE_APPROVED',
    entityType: 'Request',
    entityId: requestId,
    after: updated,
  });

  if (isFinalStage) {
    const workflow = getWorkflow(request.type);
    if (workflow.generatesDocument && workflow.buildDocument) {
      const generatedDocumentId = await issueRequestDocument(request, workflow.buildDocument, actorId);
      // issueRequestDocument already persisted this on the row; reflect it in what we hand back
      // to the caller so the approver's own response isn't stale.
      return { request: { ...updated, generatedDocumentId } };
    }
  }

  return { request: updated };
}

// Generates the resulting PDF, uploads it via the existing Cloudinary
// buffer-upload path, and records it as a real IssuedLetter -- same
// pattern already used for every other letter in the platform.
async function issueRequestDocument(
  request: { id: string; submitterId: string; submitter: { name: string }; payload: unknown },
  buildDocument: (ctx: RequestDocumentContext) => { type: string; title: string; body: string },
  issuedById: string
): Promise<string> {
  const [settings, issuer] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: issuedById } }),
  ]);

  const doc = buildDocument({
    submitterName: request.submitter.name,
    payload: (request.payload as Record<string, unknown>) ?? null,
  });

  const pdfBuffer = await generateLetterPdf({
    institutionName: settings?.institutionName ?? 'Institution',
    title: doc.title,
    body: doc.body,
    studentName: request.submitter.name,
    issuedByName: issuer?.name ?? 'Registrar',
    date: new Date(),
  });

  const uploaded = await uploadBuffer(pdfBuffer, 'letters/requests');

  const letter = await prisma.issuedLetter.create({
    data: {
      studentId: request.submitterId,
      type: doc.type,
      title: doc.title,
      bodyText: doc.body,
      fileUrl: uploaded.secureUrl,
      filePublicId: uploaded.publicId,
      issuedById,
    },
  });

  await prisma.request.update({ where: { id: request.id }, data: { generatedDocumentId: letter.id } });
  return letter.id;
}

export default router;
