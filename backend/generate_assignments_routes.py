#!/usr/bin/env python3
"""
Generates src/routes/assignments.routes.ts:
  POST   /assignments                         -> Teacher/Admin creates one for a unit (active term)
  GET    /assignments/unit/:unitId             -> list assignments for a unit
  GET    /assignments/:id                      -> assignment detail
  POST   /assignments/:id/submit               -> Student submits/updates own work
  GET    /assignments/:id/submissions          -> Teacher/Admin: all submissions for grading
  PATCH  /assignments/submissions/:id/grade    -> Teacher/Admin: set score + feedback
  GET    /assignments/my-submissions           -> Student: own submissions, any assignment
  DELETE /assignments/:id                      -> creator or Admin

Also patches src/routes/academic.routes.ts to add GET /units/mine (Teacher's
own assigned units for the active term -- needed to build assignments
against a unit without hunting for unit IDs elsewhere).

Patches src/index.ts to import + mount the new router.

USAGE (run from ~/runyenjes-platform/backend):
    python3 generate_assignments_routes.py

Idempotent: skips existing route file (use --force to overwrite), skips
patches already applied.
"""

import argparse
import os
import sys

ROUTES_DIR = os.path.join("src", "routes")
ASSIGNMENTS_PATH = os.path.join(ROUTES_DIR, "assignments.routes.ts")
ACADEMIC_PATH = os.path.join(ROUTES_DIR, "academic.routes.ts")
INDEX_PATH = os.path.join("src", "index.ts")

ASSIGNMENTS_TS = """import { Router } from 'express';
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
"""

ACADEMIC_UNITS_MINE_ANCHOR = "const router = Router();"

ACADEMIC_UNITS_MINE_ROUTE = """

// ---------- Teacher: my own assigned units for the active term ----------
router.get('/units/mine', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json([]);

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
    include: { unit: { include: { program: { include: { department: true } } } } },
  });

  res.json(assignments.map((a) => a.unit));
});
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def write_route_file(force: bool) -> None:
    if not os.path.isdir(ROUTES_DIR):
        print("ERROR: '" + ROUTES_DIR + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    if os.path.exists(ASSIGNMENTS_PATH) and not force:
        print("SKIP  " + ASSIGNMENTS_PATH + " already exists (use --force to overwrite)")
        return
    with open(ASSIGNMENTS_PATH, "w") as f:
        f.write(ASSIGNMENTS_TS)
    print("WROTE " + ASSIGNMENTS_PATH)


def patch_academic() -> None:
    if not os.path.isfile(ACADEMIC_PATH):
        print("ERROR: '" + ACADEMIC_PATH + "' not found.")
        sys.exit(1)
    with open(ACADEMIC_PATH, "r") as f:
        content = f.read()
    if "units/mine" in content:
        print("SKIP  " + ACADEMIC_PATH + " already has GET /units/mine.")
        return
    if ACADEMIC_UNITS_MINE_ANCHOR not in content:
        print("ERROR: could not find 'const router = Router();' in " + ACADEMIC_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(
        ACADEMIC_UNITS_MINE_ANCHOR, ACADEMIC_UNITS_MINE_ANCHOR + ACADEMIC_UNITS_MINE_ROUTE, 1
    )
    with open(ACADEMIC_PATH, "w") as f:
        f.write(content)
    print("PATCHED " + ACADEMIC_PATH + " (added GET /academic/units/mine for Teachers)")


def patch_index() -> None:
    if not os.path.isfile(INDEX_PATH):
        print("ERROR: '" + INDEX_PATH + "' not found.")
        sys.exit(1)
    with open(INDEX_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "assignments.routes" in joined:
        print("SKIP  " + INDEX_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "jobRoutes from './routes/job.routes'")
    if import_idx is None:
        import_idx = find_line_index(lines, "academicRoutes from './routes/academic.routes'")
    if import_idx is None:
        print("ERROR: could not find an anchor import in " + INDEX_PATH + ". Patch manually.")
        sys.exit(1)

    mount_idx = find_line_index(lines, "app.use('/jobs', jobRoutes);")
    if mount_idx is None:
        mount_idx = find_line_index(lines, "app.use('/academic', academicRoutes);")
    if mount_idx is None:
        print("ERROR: could not find an anchor mount in " + INDEX_PATH + ". Patch manually.")
        sys.exit(1)

    new_import = "import assignmentsRoutes from './routes/assignments.routes';\n"
    new_mount = "app.use('/assignments', assignmentsRoutes);\n"

    if mount_idx > import_idx:
        lines2 = lines[: mount_idx + 1] + [new_mount] + lines[mount_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_import] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_import] + lines[import_idx + 1 :]
        mount_idx2 = find_line_index(lines2, "app.use('/jobs', jobRoutes);")
        if mount_idx2 is None:
            mount_idx2 = find_line_index(lines2, "app.use('/academic', academicRoutes);")
        lines3 = lines2[: mount_idx2 + 1] + [new_mount] + lines2[mount_idx2 + 1 :]

    with open(INDEX_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + INDEX_PATH + " (added assignments.routes import + mount)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_route_file(args.force)
    patch_academic()
    patch_index()

    print("")
    print("Done.")


if __name__ == "__main__":
    main()
