import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../utils/jwt';

const router = Router();

// ============================================================
// Student login
// Students use EMAIL + ADMISSION NUMBER.
// Students do NOT use passwords.
// ============================================================
router.post('/student-login', async (req, res) => {
  try {
    const { email, admissionNumber } = req.body;

    if (!email || !admissionNumber) {
      return res.status(400).json({
        error: 'Email and admission number are both required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (
      !user ||
      (user.role !== 'STUDENT' && user.role !== 'ALUMNI') ||
      user.admissionNumber !== admissionNumber
    ) {
      return res.status(401).json({
        error: 'Email or admission number is incorrect',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'This account is not active. Contact the registrar.',
      });
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
      name: user.name,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error('Student login error:', error);

    return res.status(500).json({
      error: 'Failed to log in.',
    });
  }
});

// ============================================================
// Staff login
// Staff use EMAIL + PASSWORD.
// Applies to Teacher, Admin, Registrar and Founder.
// ============================================================
router.post('/staff-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are both required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: 'Email or password is incorrect',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({
        error: 'Email or password is incorrect',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'This account is not active.',
      });
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
      name: user.name,
    });

    return res.json({
      token,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('Staff login error:', error);

    return res.status(500).json({
      error: 'Failed to log in.',
    });
  }
});

export default router;
