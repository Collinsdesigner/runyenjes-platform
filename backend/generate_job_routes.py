#!/usr/bin/env python3
"""
Generates src/routes/job.routes.ts:
  POST   /jobs                -> any authenticated non-STUDENT user posts a listing
  GET    /jobs                 -> ALUMNI or ADMIN browse open postings
  GET    /jobs/my-postings     -> poster views their own postings (any status)
  PATCH  /jobs/:id/status      -> poster or ADMIN opens/closes a listing
  DELETE /jobs/:id             -> poster or ADMIN removes a listing

Patches src/index.ts to import + mount the new router.

USAGE (run from ~/runyenjes-platform/backend):
    python3 generate_job_routes.py

Idempotent: skips existing route file (use --force to overwrite), skips
index.ts patch if already applied.
"""

import argparse
import os
import sys

ROUTES_DIR = os.path.join("src", "routes")
JOB_ROUTES_PATH = os.path.join(ROUTES_DIR, "job.routes.ts")
INDEX_PATH = os.path.join("src", "index.ts")

JOB_ROUTES_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ---------- Any authenticated staff member or alumnus: post a job opening ----------
// Students cannot post -- everyone else (staff of any kind, or Alumni) can.
router.post('/', requireAuth, async (req, res) => {
  if (req.user!.role === 'STUDENT') {
    return res.status(403).json({ error: 'Students cannot post job openings' });
  }

  const { title, company, location, description, applyLink, contactEmail } = req.body;

  if (!title || !company || !description) {
    return res.status(400).json({ error: 'title, company and description are required' });
  }

  const posting = await prisma.jobPosting.create({
    data: {
      title,
      company,
      location: location || null,
      description,
      applyLink: applyLink || null,
      contactEmail: contactEmail || null,
      postedById: req.user!.userId,
    },
  });

  res.status(201).json(posting);
});

// ---------- Alumni/Admin: browse open postings ----------
router.get('/', requireAuth, async (req, res) => {
  if (req.user!.role !== 'ALUMNI' && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only Alumni can browse the job board' });
  }

  const { status } = req.query as { status?: string };
  const isAdmin = req.user!.role === 'ADMIN';

  const postings = await prisma.jobPosting.findMany({
    where: isAdmin && status ? { status: status as any } : { status: 'OPEN' },
    include: { postedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(postings);
});

// ---------- Poster: view own postings, any status ----------
router.get('/my-postings', requireAuth, async (req, res) => {
  const postings = await prisma.jobPosting.findMany({
    where: { postedById: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(postings);
});

// ---------- Poster or Admin: open/close a listing ----------
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'OPEN' | 'CLOSED'

  if (status !== 'OPEN' && status !== 'CLOSED') {
    return res.status(400).json({ error: "status must be 'OPEN' or 'CLOSED'" });
  }

  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting) return res.status(404).json({ error: 'Posting not found' });

  const isOwner = posting.postedById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own postings' });
  }

  const updated = await prisma.jobPosting.update({ where: { id }, data: { status } });
  res.json(updated);
});

// ---------- Poster or Admin: delete a listing ----------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting) return res.status(404).json({ error: 'Posting not found' });

  const isOwner = posting.postedById === req.user!.userId;
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own postings' });
  }

  await prisma.jobPosting.delete({ where: { id } });
  res.status(204).send();
});

export default router;
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
    if os.path.exists(JOB_ROUTES_PATH) and not force:
        print("SKIP  " + JOB_ROUTES_PATH + " already exists (use --force to overwrite)")
        return
    with open(JOB_ROUTES_PATH, "w") as f:
        f.write(JOB_ROUTES_TS)
    print("WROTE " + JOB_ROUTES_PATH)


def patch_index() -> None:
    if not os.path.isfile(INDEX_PATH):
        print("ERROR: '" + INDEX_PATH + "' not found.")
        sys.exit(1)
    with open(INDEX_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "job.routes" in joined:
        print("SKIP  " + INDEX_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "procurementRoutes from './routes/procurement.routes'")
    if import_idx is None:
        import_idx = find_line_index(lines, "storesRoutes from './routes/stores.routes'")
    if import_idx is None:
        print("ERROR: could not find an anchor import in " + INDEX_PATH + ". Patch manually.")
        sys.exit(1)

    mount_idx = find_line_index(lines, "app.use('/procurement', procurementRoutes);")
    if mount_idx is None:
        mount_idx = find_line_index(lines, "app.use('/stores', storesRoutes);")
    if mount_idx is None:
        print("ERROR: could not find an anchor mount in " + INDEX_PATH + ". Patch manually.")
        sys.exit(1)

    new_import = "import jobRoutes from './routes/job.routes';\n"
    new_mount = "app.use('/jobs', jobRoutes);\n"

    if mount_idx > import_idx:
        lines2 = lines[: mount_idx + 1] + [new_mount] + lines[mount_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_import] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_import] + lines[import_idx + 1 :]
        mount_idx2 = find_line_index(lines2, "app.use('/procurement', procurementRoutes);")
        if mount_idx2 is None:
            mount_idx2 = find_line_index(lines2, "app.use('/stores', storesRoutes);")
        lines3 = lines2[: mount_idx2 + 1] + [new_mount] + lines2[mount_idx2 + 1 :]

    with open(INDEX_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + INDEX_PATH + " (added job.routes import + mount)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_route_file(args.force)
    patch_index()

    print("")
    print("Done.")


if __name__ == "__main__":
    main()
