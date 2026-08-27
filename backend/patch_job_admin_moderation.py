#!/usr/bin/env python3
"""
Fixes GET /jobs so Admin sees ALL postings (any status) by default,
instead of only OPEN ones. Alumni still only ever see OPEN postings.
This is what makes real moderation possible -- previously Admin had no
way to see or manage a Closed (or any non-open) posting at all.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_job_admin_moderation.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "job.routes.ts")

OLD_BLOCK = """  const { status } = req.query as { status?: string };
  const isAdmin = req.user!.role === 'ADMIN';

  const postings = await prisma.jobPosting.findMany({
    where: isAdmin && status ? { status: status as any } : { status: 'OPEN' },
    include: { postedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });"""

NEW_BLOCK = """  const { status } = req.query as { status?: string };
  const isAdmin = req.user!.role === 'ADMIN';

  // Admin sees every posting by default (for moderation), optionally
  // filtered to a specific status. Alumni only ever see OPEN postings.
  const where = isAdmin ? (status ? { status: status as any } : {}) : { status: 'OPEN' as const };

  const postings = await prisma.jobPosting.findMany({
    where,
    include: { postedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });"""


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(TARGET, "r") as f:
        content = f.read()

    if "sees every posting by default" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    if OLD_BLOCK not in content:
        print("ERROR: could not find the expected GET /jobs block in " + TARGET + ". Patch manually.")
        sys.exit(1)

    content = content.replace(OLD_BLOCK, NEW_BLOCK)
    with open(TARGET, "w") as f:
        f.write(content)

    print("PATCHED " + TARGET + " (Admin now sees all postings by default, not just OPEN)")


if __name__ == "__main__":
    main()
