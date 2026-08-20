import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();


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

// ---------- Stores/Admin: list inventory items (optionally filter by department) ----------
router.get('/items', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const { departmentId } = req.query as { departmentId?: string };

  const items = await prisma.inventoryItem.findMany({
    where: departmentId ? { departmentId } : {},
    include: { department: true },
    orderBy: { name: 'asc' },
  });

  res.json(items);
});

// ---------- Stores/Admin: get a single item with its movement history ----------
router.get('/items/:id', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: req.params.id },
    include: {
      department: true,
      movements: {
        include: { recordedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// ---------- Stores/Admin: create a new inventory item ----------
router.post('/items', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const { name, category, uom, reorderLevel, departmentId } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const item = await prisma.inventoryItem.create({
    data: {
      name,
      category: category || null,
      uom: uom || 'pcs',
      reorderLevel: reorderLevel ?? 0,
      departmentId: departmentId || null,
    },
  });

  res.status(201).json(item);
});

// ---------- Stores/Admin: update item details (not quantity — use /movements for that) ----------
router.patch('/items/:id', requireAuth, requireRole('STORES_OFFICER', 'ADMIN'), async (req, res) => {
  const { name, category, uom, reorderLevel, departmentId } = req.body;

  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(uom !== undefined ? { uom } : {}),
      ...(reorderLevel !== undefined ? { reorderLevel } : {}),
      ...(departmentId !== undefined ? { departmentId } : {}),
    },
  });

  res.json(item);
});

// ---------- Stores/Admin: record a stock movement (receipt/issue/adjustment) ----------
// Runs in a transaction so quantityOnHand and the movement log never drift apart.
router.post(
  '/items/:id/movements',
  requireAuth,
  requireRole('STORES_OFFICER', 'ADMIN'),
  async (req, res) => {
    const { id: itemId } = req.params;
    const { type, quantity, reason } = req.body;

    if (!type || quantity === undefined) {
      return res.status(400).json({ error: 'type and quantity are required' });
    }
    if (!['RECEIPT', 'ISSUE', 'ADJUSTMENT'].includes(type)) {
      return res.status(400).json({ error: "type must be 'RECEIPT', 'ISSUE' or 'ADJUSTMENT'" });
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const qty = Number(quantity);
    const delta = type === 'ISSUE' ? -Math.abs(qty) : Math.abs(qty);
    const newQuantity = Number(item.quantityOnHand) + delta;

    if (newQuantity < 0) {
      return res.status(400).json({ error: 'This movement would take stock below zero' });
    }

    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: { itemId, type, quantity: qty, reason: reason || null, recordedById: req.user!.userId },
      }),
      prisma.inventoryItem.update({ where: { id: itemId }, data: { quantityOnHand: newQuantity } }),
    ]);

    res.status(201).json(movement);
  }
);

export default router;
