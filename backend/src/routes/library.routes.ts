import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- List units for a program (any logged-in member of that program's class group) ----------
router.get('/programs/:programId/units', requireAuth, async (req, res) => {
  const { programId } = req.params;

  // Founder/Admin/Registrar/Teacher can browse any program; Students must be a
  // member of that program's class group.
  if (req.user!.role === 'STUDENT') {
    const group = await prisma.group.findUnique({ where: { programId } });
    const membership = group
      ? await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId: group.id, userId: req.user!.userId } },
        })
      : null;
    if (!membership) {
      return res.status(403).json({ error: 'You are not enrolled in this program' });
    }
  }

  const units = await prisma.unit.findMany({
    where: { programId },
    include: { materials: { include: { uploader: { select: { name: true } } } } },
    orderBy: { name: 'asc' },
  });

  res.json(units);
});

// Helper: a Teacher may only manage units/materials for programs inside their
// own department. Admin/Founder keep platform-wide authority, unrestricted.
async function canManageProgram(userRole: string, userDepartmentId: string | null, programId: string) {
if (userRole === 'ADMIN') return true;
  if (userRole !== 'TEACHER') return false;
  if (!userDepartmentId) return false;

  const program = await prisma.program.findUnique({ where: { id: programId } });
  return program?.departmentId === userDepartmentId;
}

// ---------- Teacher/Admin/Founder: create a unit under a program ----------
router.post(
  '/programs/:programId/units',
  requireAuth,
requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const { programId } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Unit name is required' });

    const allowed = await canManageProgram(req.user!.role, req.user!.departmentId, programId);
    if (!allowed) {
      return res
        .status(403)
        .json({ error: 'You can only manage the Library for your own department\'s programs' });
    }

    const unit = await prisma.unit.create({ data: { programId, name: name.trim() } });
    res.status(201).json(unit);
  }
);

// ---------- Teacher/Admin/Founder: add a material (link) to a unit ----------
// type is a free-text label: 'pdf' | 'slides' | 'video' | 'external-link' etc.
router.post(
  '/units/:unitId/materials',
  requireAuth,
  requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const { unitId } = req.params;
    const { fileUrl, type } = req.body;
    if (!fileUrl || !type) {
      return res.status(400).json({ error: 'A link and a type are required' });
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const allowed = await canManageProgram(req.user!.role, req.user!.departmentId, unit.programId);
    if (!allowed) {
      return res
        .status(403)
        .json({ error: 'You can only manage the Library for your own department\'s programs' });
    }

    const material = await prisma.material.create({
      data: { unitId, uploadedBy: req.user!.userId, fileUrl, type },
      include: { uploader: { select: { name: true } } },
    });

    res.status(201).json(material);
  }
);

// ---------- Teacher/Admin/Founder: delete a unit (and its materials) ----------
router.delete(
  '/units/:unitId',
  requireAuth,
  requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const { unitId } = req.params;

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const allowed = await canManageProgram(req.user!.role, req.user!.departmentId, unit.programId);
    if (!allowed) {
      return res
        .status(403)
        .json({ error: 'You can only manage the Library for your own department\'s programs' });
    }

    await prisma.material.deleteMany({ where: { unitId } });
    await prisma.unit.delete({ where: { id: unitId } });
    res.status(204).send();
  }
);

export default router;
