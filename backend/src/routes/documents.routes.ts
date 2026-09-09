import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadDocument, deleteDocument } from '../services/media.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB -- documents can be larger than avatars
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (file.mimetype.startsWith('image/') || allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDF, or Word documents are allowed'));
    }
  },
});

// ---------- Registrar/Admin: upload a document for a student ----------
router.post(
  '/students/:studentId',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  upload.single('file'),
  async (req, res) => {
    const { studentId } = req.params;
    const { title } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Student not found' });
    }

    try {
      const uploaded = await uploadDocument(req.file, 'student-documents');

      const doc = await prisma.studentDocument.create({
        data: {
          studentId,
          title: title.trim(),
          fileUrl: uploaded.secureUrl,
          filePublicId: uploaded.publicId,
          uploadedById: req.user!.userId,
        },
      });

      res.status(201).json(doc);
    } catch (error) {
      console.error('Document upload failed:', error);
      res.status(500).json({ error: 'Document upload failed' });
    }
  }
);

// ---------- List a student's documents (Registrar/Admin for anyone, student for themselves) ----------
router.get('/students/:studentId', requireAuth, async (req, res) => {
  const { studentId } = req.params;

  const isSelf = req.user!.userId === studentId;
  const isStaff = req.user!.role === 'REGISTRAR' || req.user!.role === 'ADMIN';
  if (!isSelf && !isStaff) {
    return res.status(403).json({ error: 'You cannot view these documents' });
  }

  const documents = await prisma.studentDocument.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { name: true } } },
  });

  res.json(documents);
});

// ---------- Registrar/Admin: delete a document ----------
router.delete('/:id', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { id } = req.params;

  const doc = await prisma.studentDocument.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  try {
    await deleteDocument(doc.filePublicId);
  } catch (error) {
    console.error('Cloudinary delete failed (continuing to remove DB record):', error);
  }

  await prisma.studentDocument.delete({ where: { id } });
  res.status(204).send();
});

export default router;
