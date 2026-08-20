#!/usr/bin/env python3
"""
Generates:
  src/routes/alumni.routes.ts       -> graduate a student, own alumni profile, admin list
  src/routes/procurement.routes.ts  -> purchase requests linked to Stores InventoryItem;
                                        marking a request RECEIVED creates a StockMovement
                                        and bumps quantityOnHand automatically

Patches:
  src/routes/stores.routes.ts  -> adds GET /stores/items-lite (any authenticated staff
                                   member, not just STORES_OFFICER/ADMIN) so Procurement
                                   requesters can pick an item to request
  src/index.ts                 -> imports + mounts the 2 new routers

USAGE (run from ~/runyenjes-platform/backend):
    python3 generate_alumni_procurement_routes.py

Idempotent: skips existing route files (use --force to overwrite), and
skips patches it detects are already applied.
"""

import argparse
import os
import sys

ROUTES_DIR = os.path.join("src", "routes")
STORES_PATH = os.path.join(ROUTES_DIR, "stores.routes.ts")
INDEX_PATH = os.path.join("src", "index.ts")

ALUMNI_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Registrar/Admin: graduate a student (STUDENT -> ALUMNI) ----------
// Converts the existing student account rather than creating a new identity,
// so all their enrollment/academic history stays attached to the same user.
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

    const [updatedUser, profile] = await prisma.$transaction([
      prisma.user.update({ where: { id: studentId }, data: { role: 'ALUMNI' } }),
      prisma.alumniProfile.create({
        data: { userId: studentId, graduationYear: graduationYear ? Number(graduationYear) : null },
      }),
    ]);

    res.status(201).json({ user: updatedUser, profile });
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

PROCUREMENT_TS = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Any authenticated staff member: submit a purchase request ----------
// References an existing Stores InventoryItem rather than free-text, so
// receiving the request can restock that exact item.
router.post('/requests', requireAuth, async (req, res) => {
  const { itemId, quantity, justification } = req.body;

  if (!itemId || quantity === undefined) {
    return res.status(400).json({ error: 'itemId and quantity are required' });
  }

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const request = await prisma.purchaseRequest.create({
    data: {
      itemId,
      quantity: Number(quantity),
      justification: justification || null,
      requestedById: req.user!.userId,
    },
  });

  res.status(201).json(request);
});

// ---------- Procurement/Admin: list all purchase requests (optionally filter by status) ----------
router.get(
  '/requests',
  requireAuth,
  requireRole('PROCUREMENT_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { status } = req.query as { status?: string };

    const requests = await prisma.purchaseRequest.findMany({
      where: status ? { status: status as any } : {},
      include: {
        item: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests);
  }
);

// ---------- Staff: view own purchase requests ----------
router.get('/my-requests', requireAuth, async (req, res) => {
  const requests = await prisma.purchaseRequest.findMany({
    where: { requestedById: req.user!.userId },
    include: { item: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
});

// ---------- Procurement/Admin: update a request's status ----------
// Marking a request RECEIVED automatically creates a Stores StockMovement
// (RECEIPT) and bumps InventoryItem.quantityOnHand, in a transaction, so
// Procurement and Stores never drift out of sync.
router.patch(
  '/requests/:id/status',
  requireAuth,
  requireRole('PROCUREMENT_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED' | 'REJECTED' | 'ORDERED' | 'RECEIVED'

    const validStatuses = ['APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'status must be one of: ' + validStatuses.join(', ') });
    }

    const request = await prisma.purchaseRequest.findUnique({ where: { id }, include: { item: true } });
    if (!request) return res.status(404).json({ error: 'Purchase request not found' });

    if (status === 'RECEIVED') {
      const qty = Number(request.quantity);
      const newQuantity = Number(request.item.quantityOnHand) + qty;

      const [updatedRequest] = await prisma.$transaction([
        prisma.purchaseRequest.update({
          where: { id },
          data: { status: 'RECEIVED', approvedById: req.user!.userId },
        }),
        prisma.stockMovement.create({
          data: {
            itemId: request.itemId,
            type: 'RECEIPT',
            quantity: qty,
            reason: 'Received from purchase request ' + id,
            recordedById: req.user!.userId,
          },
        }),
        prisma.inventoryItem.update({
          where: { id: request.itemId },
          data: { quantityOnHand: newQuantity },
        }),
      ]);

      return res.json(updatedRequest);
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data: { status, approvedById: req.user!.userId },
    });

    res.json(updated);
  }
);

export default router;
"""

STORES_ITEMS_LITE_ANCHOR = "const router = Router();"

STORES_ITEMS_LITE_ROUTE = """

// ---------- Any authenticated staff member: lightweight item list for picking an item ----------
// Used by Procurement (and anywhere else) to let staff choose an existing
// Stores item without needing full STORES_OFFICER/ADMIN access.
router.get('/items-lite', requireAuth, async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, uom: true, quantityOnHand: true },
    orderBy: { name: 'asc' },
  });

  res.json(items);
});
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def write_route_files(force: bool) -> None:
    if not os.path.isdir(ROUTES_DIR):
        print("ERROR: '" + ROUTES_DIR + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)

    files = {
        os.path.join(ROUTES_DIR, "alumni.routes.ts"): ALUMNI_TS,
        os.path.join(ROUTES_DIR, "procurement.routes.ts"): PROCUREMENT_TS,
    }
    for path, content in files.items():
        if os.path.exists(path) and not force:
            print("SKIP  " + path + " already exists (use --force to overwrite)")
            continue
        with open(path, "w") as f:
            f.write(content)
        print("WROTE " + path)


def patch_stores() -> None:
    if not os.path.isfile(STORES_PATH):
        print("ERROR: '" + STORES_PATH + "' not found.")
        sys.exit(1)
    with open(STORES_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "items-lite" in joined:
        print("SKIP  " + STORES_PATH + " already patched.")
        return

    anchor_idx = find_line_index(lines, STORES_ITEMS_LITE_ANCHOR)
    if anchor_idx is None:
        print("ERROR: could not find 'const router = Router();' in " + STORES_PATH + ". Patch manually.")
        sys.exit(1)

    lines = lines[: anchor_idx + 1] + [STORES_ITEMS_LITE_ROUTE] + lines[anchor_idx + 1 :]
    with open(STORES_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + STORES_PATH + " (added GET /stores/items-lite)")


def patch_index() -> None:
    if not os.path.isfile(INDEX_PATH):
        print("ERROR: '" + INDEX_PATH + "' not found.")
        sys.exit(1)
    with open(INDEX_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "alumni.routes" in joined:
        print("SKIP  " + INDEX_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "storesRoutes from './routes/stores.routes'")
    if import_idx is None:
        print("ERROR: could not find storesRoutes import in " + INDEX_PATH + ". Patch manually.")
        sys.exit(1)

    mount_idx = find_line_index(lines, "app.use('/stores', storesRoutes);")
    if mount_idx is None:
        print("ERROR: could not find stores route mount in " + INDEX_PATH + ". Patch manually.")
        sys.exit(1)

    new_imports = (
        "import alumniRoutes from './routes/alumni.routes';\n"
        "import procurementRoutes from './routes/procurement.routes';\n"
    )
    new_mounts = (
        "app.use('/alumni', alumniRoutes);\n"
        "app.use('/procurement', procurementRoutes);\n"
    )

    if mount_idx > import_idx:
        lines2 = lines[: mount_idx + 1] + [new_mounts] + lines[mount_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_imports] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_imports] + lines[import_idx + 1 :]
        mount_idx2 = find_line_index(lines2, "app.use('/stores', storesRoutes);")
        lines3 = lines2[: mount_idx2 + 1] + [new_mounts] + lines2[mount_idx2 + 1 :]

    with open(INDEX_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + INDEX_PATH + " (added 2 imports + 2 mounts)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_route_files(args.force)
    patch_stores()
    patch_index()

    print("")
    print("Done. Review with: git diff src/index.ts src/routes/stores.routes.ts")
    print("New files: git status")


if __name__ == "__main__":
    main()
