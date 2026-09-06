#!/usr/bin/env python3
"""
Broadens GET /academic/units/mine to also serve Students (their
registered units for the active term, via UnitRegistration), not just
Teachers (via UnitLecturer). Both StudentAssignments and
TeacherAssignments pages need "my units" to know what to show/create.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_units_mine_for_students.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "academic.routes.ts")

OLD_ROUTE = """// ---------- Teacher: my own assigned units for the active term ----------
router.get('/units/mine', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json([]);

  const assignments = await prisma.unitLecturer.findMany({
    where: { lecturerId: req.user!.userId, termId: term.id },
    include: { unit: { include: { program: { include: { department: true } } } } },
  });

  res.json(assignments.map((a) => a.unit));
});"""

NEW_ROUTE = """// ---------- Teacher or Student: my own units for the active term ----------
// Teachers see units they're assigned to teach; Students see units
// they're registered for.
router.get('/units/mine', requireAuth, async (req, res) => {
  const term = await prisma.term.findFirst({ where: { isActive: true } });
  if (!term) return res.json([]);

  if (req.user!.role === 'TEACHER') {
    const assignments = await prisma.unitLecturer.findMany({
      where: { lecturerId: req.user!.userId, termId: term.id },
      include: { unit: { include: { program: { include: { department: true } } } } },
    });
    return res.json(assignments.map((a) => a.unit));
  }

  if (req.user!.role === 'STUDENT') {
    const registrations = await prisma.unitRegistration.findMany({
      where: { studentId: req.user!.userId, termId: term.id, status: 'REGISTERED' },
      include: { unit: { include: { program: { include: { department: true } } } } },
    });
    return res.json(registrations.map((r) => r.unit));
  }

  res.json([]);
});"""


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(TARGET, "r") as f:
        content = f.read()

    if "Teacher or Student: my own units" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    if OLD_ROUTE not in content:
        print("ERROR: could not find the expected /units/mine route in " + TARGET + ". Patch manually.")
        sys.exit(1)

    content = content.replace(OLD_ROUTE, NEW_ROUTE)
    with open(TARGET, "w") as f:
        f.write(content)

    print("PATCHED " + TARGET + " (/units/mine now serves both Teachers and Students)")


if __name__ == "__main__":
    main()
