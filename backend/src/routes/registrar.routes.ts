import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

/**
 * Registrar dashboard statistics
 */
router.get(
  '/stats',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const [students, pendingApplications] = await Promise.all([
      prisma.user.count({
        where: {
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      }),
      prisma.application.count({
        where: {
          status: 'SUBMITTED',
        },
      }),
    ]);

    res.json({
      students,
      pendingApplications,
    });
  }
);

/**
 * Registrar student records
 */
router.get(
  '/students',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const {
      search,
      departmentId,
      status,
    } = req.query as Record<string, string | undefined>;

    const where: any = {
      role: 'STUDENT',
    };

    if (status) {
      where.status = status;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          admissionNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const students = await prisma.user.findMany({
      where,
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        admissionNumber: true,
        status: true,
        createdAt: true,

        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const emails = students.map((student) => student.email);

    const applications = emails.length
      ? await prisma.application.findMany({
          where: {
            email: {
              in: emails,
            },
            status: 'ADMITTED',
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            program: {
              include: {
                department: true,
              },
            },
          },
        })
      : [];

    const applicationByEmail = new Map<string, (typeof applications)[number]>();

    for (const application of applications) {
      if (!applicationByEmail.has(application.email)) {
        applicationByEmail.set(application.email, application);
      }
    }

    const result = students.map((student) => {
      const application = applicationByEmail.get(student.email);

      return {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        admissionNumber: student.admissionNumber,
        status: student.status,
        createdAt: student.createdAt,

        department: student.department,

        program: application
          ? {
              id: application.program.id,
              name: application.program.name,
              level: application.program.level,
              department: application.program.department,
            }
          : null,

        intake: application?.intake ?? null,
        applicationId: application?.id ?? null,
      };
    });

    res.json({
      students: result,
      total: result.length,
    });
  }
);

/**
 * Get one student record by ID
 */
router.get(
  '/students/:studentId',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { studentId } = req.params;

    const student = await prisma.user.findUnique({
      where: {
        id: studentId,
        role: 'STUDENT',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        admissionNumber: true,
        status: true,
        createdAt: true,

        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        error: 'Student record not found',
      });
    }

    const application = await prisma.application.findFirst({
      where: {
        email: student.email,
        status: 'ADMITTED',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        program: {
          include: {
            department: true,
          },
        },
      },
    });

    res.json({
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      admissionNumber: student.admissionNumber,
      status: student.status,
      createdAt: student.createdAt,

      department: student.department,

      program: application
        ? {
            id: application.program.id,
            name: application.program.name,
            level: application.program.level,
            department: application.program.department,
          }
        : null,

      intake: application?.intake ?? null,
      applicationId: application?.id ?? null,
    });
  }
);

export default router;
