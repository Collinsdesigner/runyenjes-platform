import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { generateAdmissionNumber } from '../utils/admissionNumber';
import { sendEmail } from '../utils/email';

const router = Router();

// ---------- Public: submit an application (no login needed) ----------
router.post('/', async (req, res) => {
  const { applicantName, email, phone, idNumber, programId, intake } = req.body;

  if (!applicantName || !email || !phone || !idNumber || !programId || !intake) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) return res.status(404).json({ error: 'Selected program not found' });

  const application = await prisma.application.create({
    data: { applicantName, email, phone, idNumber, programId, intake },
    include: { program: { include: { department: true } } },
  });

  res.status(201).json(application);
});

// ---------- Public: submit a payment (M-Pesa transaction code) against an application ----------
// Lightweight identity check: applicationId + the exact email used to apply,
// since the applicant may not have a logged-in account yet at this point.
router.post('/:id/payments', async (req, res) => {
  const { id } = req.params;
  const { email, amount, reference } = req.body;

  if (!email || !amount || !reference) {
    return res.status(400).json({ error: 'Email, amount, and M-Pesa transaction code are all required' });
  }

  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (application.email.toLowerCase() !== String(email).toLowerCase()) {
    return res.status(403).json({ error: 'Email does not match this application' });
  }

  const payment = await prisma.payment.create({
    data: {
      applicationId: id,
      amount: Number(amount),
      method: 'MPESA',
      reference: String(reference).trim(),
      status: 'pending',
    },
  });

  res.status(201).json(payment);
});

// ---------- Registrar/Admin/Founder: verify or reject a submitted payment ----------
router.patch(
  '/payments/:paymentId/verify',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN', 'FOUNDER'),
  async (req, res) => {
    const { paymentId } = req.params;
    const { status } = req.body; // 'verified' | 'rejected'

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be verified or rejected' });
    }

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status, verifiedById: req.user!.userId },
      include: { application: true },
    });

    const subject = status === 'verified' ? 'Payment Verified' : 'Payment Could Not Be Verified';
    const body =
      status === 'verified'
        ? `Hello ${updated.application.applicantName},\n\nYour payment of KES ${updated.amount} (ref: ${updated.reference}) has been verified. Thank you.\n\n— Runyenjes Technical & Vocational College`
        : `Hello ${updated.application.applicantName},\n\nWe could not verify your payment of KES ${updated.amount} (ref: ${updated.reference}). Please contact the Registrar's office.\n\n— Runyenjes Technical & Vocational College`;
    sendEmail(updated.application.email, subject, body);

    res.json(updated);
  }
);

// ---------- Registrar/Admin/Founder: list all applications ----------
router.get('/', requireAuth, requireRole('REGISTRAR', 'ADMIN', 'FOUNDER'), async (req, res) => {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
    include: { program: { include: { department: true } }, payments: true },
  });

  // For admitted applicants, look up their generated admission number
  // so the Registrar can see it again later, not just at the moment of admission.
  const admittedEmails = applications
    .filter((a) => a.status === 'ADMITTED')
    .map((a) => a.email);

  const students = admittedEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: admittedEmails } },
        select: { email: true, admissionNumber: true },
      })
    : [];

  const admissionNumberByEmail = new Map(students.map((s) => [s.email, s.admissionNumber]));

  const withAdmissionNumbers = applications.map((a) => ({
    ...a,
    admissionNumber: admissionNumberByEmail.get(a.email) ?? null,
  }));

  res.json(withAdmissionNumbers);
});

// ---------- Registrar/Admin/Founder: update status (admit / reject / waitlist) ----------
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN', 'FOUNDER'),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'ADMITTED' | 'REJECTED' | 'WAITLISTED'

    if (!['ADMITTED', 'REJECTED', 'WAITLISTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const application = await prisma.application.findUnique({
      where: { id },
      include: { program: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const updated = await prisma.application.update({
      where: { id },
      data: { status },
    });

    const statusText: Record<string, string> = {
      ADMITTED: 'admitted! Welcome to Runyenjes Technical & Vocational College',
      REJECTED: 'not successful this time',
      WAITLISTED: 'placed on the waitlist',
    };
    sendEmail(
      application.email,
      `Your Application — ${status}`,
      `Hello ${application.applicantName},\n\nYour application for ${application.program.name} is ${statusText[status]}.\n\n— Runyenjes Technical & Vocational College`
    );

    if (status === 'ADMITTED') {
      const existingUser = await prisma.user.findUnique({
        where: { email: application.email },
      });

      if (!existingUser) {
        const admissionNumber = await generateAdmissionNumber();

        const student = await prisma.user.create({
          data: {
            name: application.applicantName,
            email: application.email,
            phone: application.phone,
            admissionNumber,
            role: 'STUDENT',
            departmentId: application.program.departmentId,
          },
        });

        const [classGroup, deptGroup, schoolGroup] = await Promise.all([
          prisma.group.findUnique({ where: { programId: application.program.id } }),
          prisma.group.findFirst({
            where: { type: 'DEPARTMENT', departmentId: application.program.departmentId },
          }),
          prisma.group.findFirst({ where: { type: 'SCHOOL' } }),
        ]);

        const groupIds = [classGroup?.id, deptGroup?.id, schoolGroup?.id].filter(
          (gid): gid is string => Boolean(gid)
        );

        await prisma.groupMember.createMany({
          data: groupIds.map((groupId) => ({ groupId, userId: student.id })),
          skipDuplicates: true,
        });

        sendEmail(
          student.email,
          'Your Admission Number & Login Details',
          `Hello ${student.name},\n\nCongratulations! Your admission number is: ${student.admissionNumber}\n\nUse this together with your email (${student.email}) to log in as a Student on the Runyenjes platform.\n\n— Runyenjes Technical & Vocational College`
        );

        return res.json({ application: updated, student });
      }
    }

    res.json({ application: updated });
  }
);

export default router;
