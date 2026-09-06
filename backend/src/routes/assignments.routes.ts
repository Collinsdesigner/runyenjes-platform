import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Teacher/Admin: create an assignment for a unit (active term) ----------
router.post('/', requireAuth, requireRole('TEACHER', 'ADMIN'), async (req, res) => {
  const { unitId, title, description, dueDate, maxScore } = req.body;

  if (!unitId || !title) {
    return res.status(400).json({ error: 'unitId and title are required' });
  }

  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.status(400).json({ error: 'No active academic term' });

  const assignment = await prisma.assignment.create({
    data: {
      unitId,
      termId: term.id,
      title,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      maxScore: maxScore ?? 100,
      createdById: req.user!.userId,
    },
  });

  res.status(201).json(assignment);
});

// ---------- Any authenticated member of a unit: list its assignments ----------
router.get('/unit/:unitId', requireAuth, async (req, res) => {
  const { unitId } = req.params;

  const assignments = await prisma.assignment.findMany({
    where: { unitId },
    include: { unit: true, term: true, createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(assignments);
});

// ---------- Assignment detail ----------
router.get('/:id', requireAuth, async (req, res) => {
  const assignment = await prisma.assignment.findUnique({
    where: { id: req.params.id },
    include: { unit: true, term: true, createdBy: { select: { id: true, name: true } } },
  });
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  res.json(assignment);
});

// ---------- Student: submit or update own submission ----------
router.post('/:id/submit', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const { id: assignmentId } = req.params;
  const { textAnswer, fileUrl } = req.body;

  if (!textAnswer && !fileUrl) {
    return res.status(400).json({ error: 'Provide a text answer, a file/link, or both' });
  }

  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const submission = await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: req.user!.userId } },
    update: { textAnswer: textAnswer || null, fileUrl: fileUrl || null, submittedAt: new Date() },
    create: {
      assignmentId,
      studentId: req.user!.userId,
      textAnswer: textAnswer || null,
      fileUrl: fileUrl || null,
    },
  });

  res.status(201).json(submission);
});

// ---------- Teacher/Admin: view all submissions for an assignment ----------
router.get(
  '/:id/submissions',
  requireAuth,
  requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const submissions = await prisma.assignmentSubmission.findMany({
      where: { assignmentId: req.params.id },
      include: {
        student: { select: { id: true, name: true, admissionNumber: true } },
        gradedBy: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    res.json(submissions);
  }
);

// ---------- Teacher/Admin: grade a submission ----------
router.patch(
  '/submissions/:submissionId/grade',
  requireAuth,
  requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;

    if (score === undefined) {
      return res.status(400).json({ error: 'score is required' });
    }

    const submission = await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: Number(score),
        feedback: feedback || null,
        gradedById: req.user!.userId,
        gradedAt: new Date(),
      },
    });

    res.json(submission);
  }
);

// ---------- Student: view own submissions across all assignments ----------
router.get('/my-submissions', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const submissions = await prisma.assignmentSubmission.findMany({
    where: { studentId: req.user!.userId },
    include: { assignment: { include: { unit: true, term: true } } },
    orderBy: { submittedAt: 'desc' },
  });

  res.json(submissions);
});

// ---------- Creator or Admin: delete an assignment ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const assignment = await prisma.assignment.findUnique({ where: { id } });
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const isCreator = assignment.createdById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isCreator && !isAdmin) {
    return res.status(403).json({ error: 'You can only delete assignments you created' });
  }

  await prisma.assignmentSubmission.deleteMany({ where: { assignmentId: id } });
  await prisma.assignment.delete({ where: { id } });
  res.status(204).send();
});

export default router;
