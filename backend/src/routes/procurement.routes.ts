import { Router } from 'express';
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
