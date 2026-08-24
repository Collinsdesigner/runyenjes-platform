#!/usr/bin/env python3
"""
Two fixes:

1. alumni.routes.ts: the /graduate/:studentId endpoint only changed role
   and created a profile -- it never touched group memberships, so a
   graduated student stayed in their Class and Department chat groups
   forever. Rewritten to remove them from CLASS/DEPARTMENT groups and add
   them to a shared ALUMNI group (created on first use if it doesn't
   exist yet). SCHOOL-wide group membership is left as-is.

2. admin.routes.ts: adds 'ALUMNI' to assignableRoles (so an admin can
   manually correct a mistaken graduation, e.g. move someone back), but
   deliberately NOT to creatableRoles -- graduation stays the only way to
   become Alumni, not raw account creation.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_alumni_group_and_assignable_role.py

Idempotent: skips already-patched files.
"""

import os
import sys

ALUMNI_ROUTES_PATH = os.path.join("src", "routes", "alumni.routes.ts")
ADMIN_ROUTES_PATH = os.path.join("src", "routes", "admin.routes.ts")

NEW_ALUMNI_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Registrar/Admin: graduate a student (STUDENT -> ALUMNI) ----------
// Converts the existing student account rather than creating a new identity,
// so all their enrollment/academic history stays attached to the same user.
// Also moves their group chat memberships: out of Class/Department groups
// (no longer an active student in either), into a shared Alumni group.
// School-wide membership is left as-is.
router.post(
  '/graduate/:studentId',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { studentId } = req.params;
    const { graduationYear } = req.body;

    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Student not found' });
    }

    const existingProfile = await prisma.alumniProfile.findUnique({ where: { userId: studentId } });
    if (existingProfile) {
      return res.status(409).json({ error: 'This student has already been graduated to Alumni' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({ where: { id: studentId }, data: { role: 'ALUMNI' } });

      const profile = await tx.alumniProfile.create({
        data: { userId: studentId, graduationYear: graduationYear ? Number(graduationYear) : null },
      });

      // Leave Class and Department groups.
      const leavingGroups = await tx.group.findMany({
        where: { type: { in: ['CLASS', 'DEPARTMENT'] } },
        select: { id: true },
      });
      const leavingGroupIds = leavingGroups.map((g) => g.id);
      if (leavingGroupIds.length) {
        await tx.groupMember.deleteMany({
          where: { userId: studentId, groupId: { in: leavingGroupIds } },
        });
      }

      // Join the shared Alumni group, creating it on first use.
      let alumniGroup = await tx.group.findFirst({ where: { type: 'ALUMNI' } });
      if (!alumniGroup) {
        alumniGroup = await tx.group.create({ data: { type: 'ALUMNI', name: 'Alumni' } });
      }
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: alumniGroup.id, userId: studentId } },
        update: {},
        create: { groupId: alumniGroup.id, userId: studentId },
      });

      return { updatedUser, profile };
    });

    res.status(201).json({ user: result.updatedUser, profile: result.profile });
  }
);

// ---------- Alumnus: view own alumni profile ----------
router.get('/profile', requireAuth, requireRole('ALUMNI'), async (req, res) => {
  const profile = await prisma.alumniProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ error: 'Alumni profile not found' });
  res.json(profile);
});

// ---------- Alumnus: update own current employer/position ----------
router.patch('/profile', requireAuth, requireRole('ALUMNI'), async (req, res) => {
  const { currentEmployer, currentPosition } = req.body;

  const profile = await prisma.alumniProfile.update({
    where: { userId: req.user!.userId },
    data: {
      ...(currentEmployer !== undefined ? { currentEmployer } : {}),
      ...(currentPosition !== undefined ? { currentPosition } : {}),
    },
  });

  res.json(profile);
});

// ---------- Registrar/Admin: list all alumni ----------
router.get('/', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const alumni = await prisma.alumniProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, admissionNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(alumni);
});

export default router;
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def rewrite_alumni_routes():
    if not os.path.isfile(ALUMNI_ROUTES_PATH):
        print("ERROR: '" + ALUMNI_ROUTES_PATH + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(ALUMNI_ROUTES_PATH, "r") as f:
        existing = f.read()
    if "shared Alumni group" in existing:
        print("SKIP  " + ALUMNI_ROUTES_PATH + " already patched.")
        return
    with open(ALUMNI_ROUTES_PATH, "w") as f:
        f.write(NEW_ALUMNI_TS)
    print("REWROTE " + ALUMNI_ROUTES_PATH + " (graduate now moves Class/Department -> Alumni group)")


def patch_admin_assignable():
    if not os.path.isfile(ADMIN_ROUTES_PATH):
        print("ERROR: '" + ADMIN_ROUTES_PATH + "' not found.")
        sys.exit(1)
    with open(ADMIN_ROUTES_PATH, "r") as f:
        lines = f.readlines()

    assignable_idx = find_line_index(lines, "const assignableRoles = [")
    if assignable_idx is None:
        print("ERROR: could not find assignableRoles in " + ADMIN_ROUTES_PATH + ". Patch manually.")
        sys.exit(1)
    close_idx = None
    for i in range(assignable_idx + 1, len(lines)):
        if lines[i].strip().startswith("]"):
            close_idx = i
            break
    if close_idx is None:
        print("ERROR: could not find closing ']' for assignableRoles. Patch manually.")
        sys.exit(1)
    block = "".join(lines[assignable_idx:close_idx])
    if "'ALUMNI'" in block:
        print("SKIP  " + ADMIN_ROUTES_PATH + " assignableRoles already has ALUMNI.")
        return

    lines = lines[:close_idx] + ["    'ALUMNI',\n"] + lines[close_idx:]
    with open(ADMIN_ROUTES_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + ADMIN_ROUTES_PATH + " (added ALUMNI to assignableRoles only, not creatableRoles)")


def main():
    rewrite_alumni_routes()
    patch_admin_assignable()
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
