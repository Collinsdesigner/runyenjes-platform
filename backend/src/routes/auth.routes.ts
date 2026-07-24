import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../utils/jwt';

const router = Router();

// ---------- Student login: email + admission number, no password ----------
router.post('/student-login', async (req, res) => {
  const { email, admissionNumber } = req.body;
  if (!email || !admissionNumber) {
    return res.status(400).json({ error: 'Email and admission number are both required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.role !== 'STUDENT' || user.admissionNumber !== admissionNumber) {
    // Deliberately vague — don't reveal whether the email or the admission number was the wrong part
    return res.status(401).json({ error: 'Email or admission number is incorrect' });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This account is not active. Contact the registrar.' });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    departmentId: user.departmentId,
    name: user.name,
  });

  res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatarUrl: user.avatarUrl } });
});

// ---------- Staff login: email + password (Teacher, Admin, Registrar, Founder) ----------
router.post('/staff-login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are both required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This account is not active.' });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    departmentId: user.departmentId,
    name: user.name,
  });

  res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatarUrl: user.avatarUrl } });
});

export default router;
