import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadBuffer } from '../services/media.service';
import { generateLetterPdf } from '../services/letter-pdf.service';

const router = Router();

// ---------- Registrar/Admin: generate + issue a letter/certificate ----------
router.post('/students/:studentId', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { studentId } = req.params;
  const { type, title, bodyText } = req.body;

  if (!type || !title || !bodyText || !bodyText.trim()) {
    return res.status(400).json({ error: 'type, title and bodyText are required' });
  }

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== 'STUDENT') {
    return res.status(404).json({ error: 'Student not found' });
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const institutionName = settings?.institutionName || 'Institution';

  const issuedBy = await prisma.user.findUnique({ where: { id: req.user!.userId } });

  try {
    const pdfBuffer = await generateLetterPdf({
      institutionName,
      title,
      body: bodyText.trim(),
      studentName: student.name,
      issuedByName: issuedBy?.name || 'Registrar',
      date: new Date(),
    });

    const uploaded = await uploadBuffer(pdfBuffer, 'letters');

    const letter = await prisma.issuedLetter.create({
      data: {
        studentId,
        type,
        title,
        bodyText: bodyText.trim(),
        fileUrl: uploaded.secureUrl,
        filePublicId: uploaded.publicId,
        issuedById: req.user!.userId,
      },
    });

    res.status(201).json(letter);
  } catch (error) {
    console.error('Letter generation failed:', error);
    res.status(500).json({ error: 'Letter generation failed' });
  }
});

// ---------- List a student's letters (Registrar/Admin for anyone, student for themselves) ----------
router.get('/students/:studentId', requireAuth, async (req, res) => {
  const { studentId } = req.params;

  const isSelf = req.user!.userId === studentId;
  const isStaff = req.user!.role === 'REGISTRAR' || req.user!.role === 'ADMIN';
  if (!isSelf && !isStaff) {
    return res.status(403).json({ error: 'You cannot view these letters' });
  }

  const letters = await prisma.issuedLetter.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: { issuedBy: { select: { name: true } } },
  });

  res.json(letters);
});

// ---------- Registrar/Admin: delete an issued letter ----------
router.delete('/:id', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { id } = req.params;

  const letter = await prisma.issuedLetter.findUnique({ where: { id } });
  if (!letter) return res.status(404).json({ error: 'Letter not found' });

  await prisma.issuedLetter.delete({ where: { id } });
  res.status(204).send();
});

export default router;
