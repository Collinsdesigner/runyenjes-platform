import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ============================================================
// PROGRAMMES + UNITS
// ============================================================

// View programmes with their units
router.get(
  '/programmes',
  requireAuth,
  async (_req, res) => {
    const programmes = await prisma.program.findMany({
      include: {
        department: true,
        units: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: [
        { department: { name: 'asc' } },
        { name: 'asc' },
      ],
    });

    res.json(programmes);
  }
);

// ============================================================
// CURRENT STUDENT ACADEMIC DASHBOARD
// ============================================================

// Return the logged-in student's current academic information.
router.get(
  '/me',
  requireAuth,
  requireRole('STUDENT'),
  async (req, res) => {
    const userId = req.user!.userId;

    const [student, activeTerm] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          admissionNumber: true,
          phone: true,
          status: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),

      prisma.term.findFirst({
        where: { isActive: true },
      }),
    ]);

    if (!student) {
      return res.status(404).json({
        error: 'Student record not found',
      });
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: userId,
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
        unitRegistrations: {
          where: activeTerm
            ? { termId: activeTerm.id }
            : undefined,
          include: {
            unit: true,
            term: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    const continuation = activeTerm
      ? await prisma.continuationCheckIn.findUnique({
          where: {
            termId_userId: {
              termId: activeTerm.id,
              userId,
            },
          },
        })
      : null;

    res.json({
      student,
      term: activeTerm,
      continuation,
      enrollment,
    });
  }
);

// ============================================================
// STUDENT ENROLLMENT
// ============================================================

// Enrol a student into a programme
router.post(
  '/enrollments',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { studentId, programId } = req.body;

    if (!studentId || !programId) {
      return res.status(400).json({
        error: 'Student and programme are required',
      });
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({
        error: 'Student not found',
      });
    }

    const program = await prisma.program.findUnique({
      where: { id: programId },
    });

    if (!program) {
      return res.status(404).json({
        error: 'Programme not found',
      });
    }


    // --------------------------------------------------------
    // Programme eligibility protection
    // A student may only be enrolled in a programme belonging
    // to the student's department.
    // --------------------------------------------------------
    if (
      student.departmentId &&
      program.departmentId !== student.departmentId
    ) {
      return res.status(400).json({
        error:
          'This programme does not belong to the student\'s department',
      });
    }

    // A student should have only one current programme enrollment.
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
      },
    });

    if (existingEnrollment) {
      return res.status(409).json({
        error: 'Student is already enrolled in a programme',
      });
    }

    const existing = await prisma.enrollment.findUnique({
      where: {
        studentId_programId: {
          studentId,
          programId,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Student is already enrolled in this programme',
      });
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        programId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            admissionNumber: true,
          },
        },
        program: {
          include: {
            department: true,
          },
        },
      },
    });

    res.status(201).json(enrollment);
  }
);

// View a student's enrolments
router.get(
  '/students/:studentId/enrollments',
  requireAuth,
  async (req, res) => {
    const { studentId } = req.params;

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      include: {
        program: {
          include: {
            department: true,
            units: true,
          },
        },
        unitRegistrations: {
          include: {
            unit: true,
            term: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(enrollments);
  }
);

// ============================================================
// STUDENT SELF-SERVICE UNIT REGISTRATION
// ============================================================

// Register the logged-in student for a unit in the active term.
router.post(
  '/my-unit-registrations',
  requireAuth,
  requireRole('STUDENT'),
  async (req, res) => {
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).json({
        error: 'Unit is required',
      });
    }

    const studentId = req.user!.userId;

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!enrollment) {
      return res.status(400).json({
        error: 'You are not enrolled in a programme',
      });
    }

    const unit = await prisma.unit.findUnique({
      where: {
        id: unitId,
      },
    });

    if (!unit) {
      return res.status(404).json({
        error: 'Unit not found',
      });
    }

    if (unit.programId !== enrollment.programId) {
      return res.status(403).json({
        error: 'This unit does not belong to your programme',
      });
    }

    const term = await prisma.term.findFirst({
      where: {
        isActive: true,
      },
    });

    if (!term) {
      return res.status(400).json({
        error: 'No active academic term',
      });
    }

    const existing = await prisma.unitRegistration.findUnique({
      where: {
        enrollmentId_unitId_termId: {
          enrollmentId: enrollment.id,
          unitId,
          termId: term.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'You are already registered for this unit this term',
      });
    }

    const registration = await prisma.unitRegistration.create({
      data: {
        enrollmentId: enrollment.id,
        studentId,
        unitId,
        termId: term.id,
      },
      include: {
        unit: true,
        term: true,
      },
    });

    res.status(201).json(registration);
  }
);

// ============================================================
// UNIT REGISTRATION
// ============================================================

// Register a student for a unit in the active term
router.post(
  '/unit-registrations',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { enrollmentId, unitId } = req.body;

    if (!enrollmentId || !unitId) {
      return res.status(400).json({
        error: 'Enrollment and unit are required',
      });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found',
      });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      return res.status(404).json({
        error: 'Unit not found',
      });
    }

    if (unit.programId !== enrollment.programId) {
      return res.status(400).json({
        error: 'This unit does not belong to the student\'s programme',
      });
    }

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.status(400).json({
        error: 'No active academic term',
      });
    }

    const existing = await prisma.unitRegistration.findUnique({
      where: {
        enrollmentId_unitId_termId: {
          enrollmentId,
          unitId,
          termId: term.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Student is already registered for this unit this term',
      });
    }

    const registration = await prisma.unitRegistration.create({
      data: {
        enrollmentId,
        studentId: enrollment.studentId,
        unitId,
        termId: term.id,
      },
      include: {
        unit: true,
        term: true,
      },
    });

    res.status(201).json(registration);
  }
);

// ============================================================
// STUDENT TIMETABLE
// ============================================================

// Return timetable entries for units registered by the logged-in student.
// The endpoint is intentionally read-only for students.
router.get(
  '/my-timetable',
  requireAuth,
  requireRole('STUDENT'),
  async (req, res) => {
    const studentId = req.user!.userId;

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.json({
        term: null,
        timetable: [],
      });
    }

    const registrations = await prisma.unitRegistration.findMany({
      where: {
        studentId,
        termId: term.id,
        status: 'REGISTERED',
      },
      include: {
        unit: true,
        term: true,
      },
      orderBy: {
        unit: {
          name: 'asc',
        },
      },
    });

    // Timetable scheduling fields are not yet part of the academic core.
    // Return the registered units so the frontend can establish the
    // student's timetable workspace without inventing schedule data.
    res.json({
      term,
      timetable: registrations.map((registration) => ({
        id: registration.id,
        unit: registration.unit,
        status: registration.status,
      })),
    });
  }
);


// ============================================================
// TIMETABLE
// ============================================================

// Student: view timetable for the active term
router.get(
  '/timetable',
  requireAuth,
  async (req, res) => {
    const userId = req.user!.userId;

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.json({
        term: null,
        timetable: [],
      });
    }

    const registrations = await prisma.unitRegistration.findMany({
      where: {
        studentId: userId,
        termId: term.id,
        status: 'REGISTERED',
      },
      select: {
        unitId: true,
      },
    });

    const unitIds = registrations.map((registration) => registration.unitId);

    if (unitIds.length === 0) {
      return res.json({
        term,
        timetable: [],
      });
    }

    const timetable = await prisma.timetableEntry.findMany({
      where: {
        termId: term.id,
        unitId: {
          in: unitIds,
        },
      },
      include: {
        unit: true,
        term: true,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    res.json({
      term,
      timetable,
    });
  }
);

// Registrar/Admin: create timetable entry
router.post(
  '/timetable',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const {
      unitId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      notes,
    } = req.body;

    if (
      !unitId ||
      dayOfWeek === undefined ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        error: 'Unit, day, start time and end time are required',
      });
    }

    const day = Number(dayOfWeek);

    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return res.status(400).json({
        error: 'Day of week must be between 1 and 7',
      });
    }

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.status(400).json({
        error: 'No active academic term',
      });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      return res.status(404).json({
        error: 'Unit not found',
      });
    }

    const existing = await prisma.timetableEntry.findUnique({
      where: {
        unitId_termId_dayOfWeek_startTime: {
          unitId,
          termId: term.id,
          dayOfWeek: day,
          startTime,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'This unit already has a timetable entry at this time',
      });
    }

    
    // ============================================================
    // TIMETABLE CONFLICT PROTECTION
    // ============================================================
    //
    // TimetableEntry stores startTime/endTime as strings.
    //
    // Prevent:
    // 1. Same unit being scheduled twice at overlapping times.
    // 2. Same room being occupied by overlapping classes.
    //
    // Lecturer conflicts will be handled through UnitLecturer,
    // because TimetableEntry currently has no lecturerId field.
    // ============================================================

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: 'Start time and end time are required',
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        error: 'Timetable end time must be after start time',
      });
    }

    const overlappingEntries = await prisma.timetableEntry.findMany({
      where: {
        termId: term.id,
        dayOfWeek,
        startTime: {
          lt: endTime,
        },
        endTime: {
          gt: startTime,
        },
      },
      include: {
        unit: true,
        lecturer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const unitConflict = overlappingEntries.find(
      (entry) => entry.unitId === unitId
    );

    if (unitConflict) {
      return res.status(409).json({
        error: 'This unit is already scheduled during this time',
        conflict: {
          type: 'UNIT',
          entryId: unitConflict.id,
          unit: unitConflict.unit.name,
        },
      });
    }

    if (room && room.trim()) {
      const normalizedRoom = room.trim().toLowerCase();

      const roomConflict = overlappingEntries.find(
        (entry) =>
          entry.room &&
          entry.room.trim().toLowerCase() === normalizedRoom
      );

      if (roomConflict) {
        return res.status(409).json({
          error: 'This room is already occupied during this time',
          conflict: {
            type: 'ROOM',
            entryId: roomConflict.id,
            unit: roomConflict.unit.name,
            room: roomConflict.room,
          },
        });
      }
    }


    // ============================================================
    // TIMETABLE_LECTURER_VALIDATION
    // ============================================================

    const { lecturerId } = req.body;
    let lecturerIdForEntry: string | null = lecturerId ?? null;

    if (lecturerIdForEntry) {
      const lecturer = await prisma.user.findUnique({
        where: { id: lecturerIdForEntry },
      });

      if (!lecturer || lecturer.role !== 'TEACHER') {
        return res.status(404).json({
          error: 'Lecturer not found',
        });
      }

      const lecturerAssignment = await prisma.unitLecturer.findUnique({
        where: {
          unitId_lecturerId_termId: {
            unitId,
            lecturerId: lecturerIdForEntry,
            termId: term.id,
          },
        },
      });

      if (!lecturerAssignment) {
        return res.status(400).json({
          error: 'This lecturer is not assigned to this unit for the active term',
        });
      }
    }

const entry = await prisma.timetableEntry.create({
      data: {
        lecturerId: lecturerIdForEntry,
        unitId,
        termId: term.id,
        dayOfWeek: day,
        startTime,
        endTime,
        room: room || null,
        notes: notes || null,
      },
      include: {
        unit: true,
        term: true,
      },
    });

    res.status(201).json(entry);
  }
);

// Registrar/Admin: view active timetable
router.get(
  '/timetable/all',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (_req, res) => {
    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.json({
        term: null,
        timetable: [],
      });
    }

    const timetable = await prisma.timetableEntry.findMany({
      where: {
        termId: term.id,
      },
      include: {
        unit: {
          include: {
            program: true,
          },
        },
        term: true,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    res.json({
      term,
      timetable,
    });
  }
);

// Registrar/Admin: delete timetable entry
router.delete(
  '/timetable/:id',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.timetableEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Timetable entry not found',
      });
    }

    await prisma.timetableEntry.delete({
      where: { id },
    });

    res.json({
      message: 'Timetable entry deleted successfully',
    });
  }
);

// ============================================================
// LECTURER ASSIGNMENT
// ============================================================

// Assign a lecturer to a unit for the active term
router.post(
  '/unit-lecturers',
  requireAuth,
  requireRole('ADMIN', 'REGISTRAR'),
  async (req, res) => {
    const { unitId, lecturerId } = req.body;

    if (!unitId || !lecturerId) {
      return res.status(400).json({
        error: 'Unit and lecturer are required',
      });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      return res.status(404).json({
        error: 'Unit not found',
      });
    }

    const lecturer = await prisma.user.findUnique({
      where: { id: lecturerId },
    });

    if (!lecturer || lecturer.role !== 'TEACHER') {
      return res.status(404).json({
        error: 'Lecturer not found',
      });
    }

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.status(400).json({
        error: 'No active academic term',
      });
    }

    const existing = await prisma.unitLecturer.findUnique({
      where: {
        unitId_lecturerId_termId: {
          unitId,
          lecturerId,
          termId: term.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Lecturer is already assigned to this unit this term',
      });
    }

    const assignment = await prisma.unitLecturer.create({
      data: {
        unitId,
        lecturerId,
        termId: term.id,
      },
      include: {
        unit: true,
        lecturer: {
          select: {
            id: true,
            name: true,
            email: true,
            departmentId: true,
          },
        },
        term: true,
      },
    });

    res.status(201).json(assignment);
  }
);

// ============================================================
// UNIT REGISTRATION LIST
// ============================================================

// View students registered for a unit
router.get(
  '/units/:unitId/registrations',
  requireAuth,
  async (req, res) => {
    const { unitId } = req.params;

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.status(404).json({
        error: 'No active academic term',
      });
    }

    const registrations = await prisma.unitRegistration.findMany({
      where: {
        unitId,
        termId: term.id,
        status: 'REGISTERED',
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            admissionNumber: true,
          },
        },
        unit: true,
        term: true,
      },
      orderBy: {
        student: {
          name: 'asc',
        },
      },
    });

    res.json(registrations);
  }
);



// ============================================================
// STUDENT TIMETABLE
// ============================================================

// View the current student's timetable for the active term.
// Only timetable entries belonging to the student's registered
// units are returned.
router.get(
  '/me/timetable',
  requireAuth,
  requireRole('STUDENT'),
  async (req, res) => {
    const studentId = req.user!.userId;

    const term = await prisma.term.findFirst({
      where: { isActive: true },
    });

    if (!term) {
      return res.json({
        term: null,
        entries: [],
      });
    }

    const registrations = await prisma.unitRegistration.findMany({
      where: {
        studentId,
        termId: term.id,
        status: 'REGISTERED',
      },
      select: {
        unitId: true,
      },
    });

    const unitIds = registrations.map(
      (registration) => registration.unitId
    );

    if (unitIds.length === 0) {
      return res.json({
        term,
        entries: [],
      });
    }

    const entries = await prisma.timetableEntry.findMany({
      where: {
        termId: term.id,
        unitId: {
          in: unitIds,
        },
      },
      include: {
        unit: true,
        lecturer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        term: true,
      },
      orderBy: [
        {
          dayOfWeek: 'asc',
        },
        {
          startTime: 'asc',
        },
      ],
    });

    res.json({
      term,
      entries,
    });
  }
);

// ============================================================
// ACADEMIC STRUCTURE
// ============================================================

// Full academic structure for Registrar/Admin
router.get(
  '/structure',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (_req, res) => {
    const departments = await prisma.department.findMany({
      include: {
        programs: {
          include: {
            units: {
              orderBy: { name: 'asc' },
            },
            fees: {
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
          orderBy: [
            { name: 'asc' },
            { level: 'asc' },
          ],
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(departments);
  }
);

// Create department
router.post(
  '/departments',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Department name is required',
      });
    }

    const existing = await prisma.department.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return res.status(409).json({
        error: 'A department with this name already exists',
      });
    }

    const department = await prisma.department.create({
      data: { name: name.trim() },
    });

    res.status(201).json(department);
  }
);

// Rename department
router.patch(
  '/departments/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Department name is required',
      });
    }

    const department = await prisma.department.update({
      where: { id },
      data: { name: name.trim() },
    });

    res.json(department);
  }
);

// Create programme
router.post(
  '/departments/:departmentId/programmes',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { departmentId } = req.params;
    const {
      name,
      level,
      entryRequirements,
      examBody,
      isShortCourse,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Programme name is required',
      });
    }

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      return res.status(404).json({
        error: 'Department not found',
      });
    }

    const programme = await prisma.program.create({
      data: {
        departmentId,
        name: name.trim(),
        level: level || null,
        entryRequirements: entryRequirements || null,
        examBody: examBody || null,
        isShortCourse: Boolean(isShortCourse),
      },
      include: {
        department: true,
      },
    });

    res.status(201).json(programme);
  }
);

// Edit programme
router.patch(
  '/programmes/:id',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { id } = req.params;
    const {
      name,
      level,
      entryRequirements,
      examBody,
      isShortCourse,
    } = req.body;

    const programme = await prisma.program.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(level !== undefined ? { level: level || null } : {}),
        ...(entryRequirements !== undefined
          ? { entryRequirements: entryRequirements || null }
          : {}),
        ...(examBody !== undefined
          ? { examBody: examBody || null }
          : {}),
        ...(isShortCourse !== undefined
          ? { isShortCourse: Boolean(isShortCourse) }
          : {}),
      },
      include: {
        department: true,
      },
    });

    res.json(programme);
  }
);

// Create unit
router.post(
  '/programmes/:programId/units',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN', 'TEACHER'),
  async (req, res) => {
    const { programId } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Unit name is required',
      });
    }

    const programme = await prisma.program.findUnique({
      where: { id: programId },
    });

    if (!programme) {
      return res.status(404).json({
        error: 'Programme not found',
      });
    }

    const unit = await prisma.unit.create({
      data: {
        programId,
        name: name.trim(),
      },
    });

    res.status(201).json(unit);
  }
);

// Rename unit
router.patch(
  '/units/:id',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN', 'TEACHER'),
  async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: 'Unit name is required',
      });
    }

    const unit = await prisma.unit.update({
      where: { id },
      data: { name: name.trim() },
    });

    res.json(unit);
  }
);

// Delete unit
router.delete(
  '/units/:id',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { id } = req.params;

    const materialCount = await prisma.material.count({
      where: { unitId: id },
    });

    if (materialCount > 0) {
      return res.status(409).json({
        error: 'This unit has learning materials. Remove them first.',
      });
    }

    await prisma.unit.delete({
      where: { id },
    });

    res.json({ message: 'Unit deleted successfully' });
  }
);


// ============================================================
// TIMETABLE OPTIONS
// ============================================================

// Options used by Registrar/Admin when creating timetable entries.
// Returns programmes, units and lecturers from the live database.
router.get(
  '/timetable/options',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (_req, res) => {
    const [programmes, units, lecturers, activeTerm] =
      await Promise.all([
        prisma.program.findMany({
          include: {
            department: true,
          },
          orderBy: {
            name: 'asc',
          },
        }),

        prisma.unit.findMany({
          include: {
            program: {
              include: {
                department: true,
              },
            },
          },
          orderBy: {
            name: 'asc',
          },
        }),

        prisma.user.findMany({
          where: {
            role: 'TEACHER',
          },
          select: {
            id: true,
            name: true,
            email: true,
            departmentId: true,
          },
          orderBy: {
            name: 'asc',
          },
        }),

        prisma.term.findFirst({
          where: {
            isActive: true,
          },
        }),
      ]);

    res.json({
      programmes,
      units,
      lecturers,
      activeTerm,
    });
  }
);


// ============================================================
// STUDENT LIVE TIMETABLE
// ============================================================

// Returns the timetable for units the logged-in student has
// actually registered for in the active academic term.
router.get(
  '/timetable/student-live',
  requireAuth,
  async (req, res) => {
    const studentId = req.user!.userId;

    if (req.user!.role !== 'STUDENT') {
      return res.status(403).json({
        error: 'Student access required',
      });
    }

    const activeTerm = await prisma.term.findFirst({
      where: {
        isActive: true,
      },
    });

    if (!activeTerm) {
      return res.json({
        term: null,
        entries: [],
      });
    }

    const registrations = await prisma.unitRegistration.findMany({
      where: {
        studentId,
        termId: activeTerm.id,
        status: 'REGISTERED',
      },
      select: {
        unitId: true,
      },
    });

    const unitIds = registrations.map(
      (registration) => registration.unitId
    );

    if (unitIds.length === 0) {
      return res.json({
        term: activeTerm,
        entries: [],
      });
    }

    const entries = await prisma.timetableEntry.findMany({
      where: {
        termId: activeTerm.id,
        unitId: {
          in: unitIds,
        },
      },
      include: {
        unit: true,
        lecturer: {
          select: {
            id: true,
            name: true,
            email: true,
            departmentId: true,
          },
        },
        term: true,
      },
      orderBy: [
        {
          dayOfWeek: 'asc',
        },
        {
          startTime: 'asc',
        },
      ],
    });

    res.json({
      term: activeTerm,
      entries,
    });
  }
);


// ============================================================
// TIMETABLE MANAGEMENT
// ============================================================

// List current timetable entries for Registrar/Admin.
router.get(
  '/timetable/entries',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (_req, res) => {
    const activeTerm = await prisma.term.findFirst({
      where: {
        isActive: true,
      },
    });

    if (!activeTerm) {
      return res.json([]);
    }

    const entries = await prisma.timetableEntry.findMany({
      where: {
        termId: activeTerm.id,
      },
      include: {
        unit: {
          include: {
            program: true,
          },
        },
        lecturer: {
          select: {
            id: true,
            name: true,
            email: true,
            departmentId: true,
          },
        },
        term: true,
      },
      orderBy: [
        {
          dayOfWeek: 'asc',
        },
        {
          startTime: 'asc',
        },
      ],
    });

    res.json(entries);
  }
);

// Create a timetable entry.
router.post(
  '/timetable/entries',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const {
      unitId,
      lecturerId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      notes,
    } = req.body;

    if (
      !unitId ||
      dayOfWeek === undefined ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        error:
          'Unit, day, start time and end time are required',
      });
    }

    if (
      typeof dayOfWeek !== 'number' ||
      dayOfWeek < 1 ||
      dayOfWeek > 7
    ) {
      return res.status(400).json({
        error: 'Invalid day of week',
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        error: 'End time must be later than start time',
      });
    }

    const term = await prisma.term.findFirst({
      where: {
        isActive: true,
      },
    });

    if (!term) {
      return res.status(400).json({
        error: 'No active academic term',
      });
    }

    const unit = await prisma.unit.findUnique({
      where: {
        id: unitId,
      },
    });

    if (!unit) {
      return res.status(404).json({
        error: 'Unit not found',
      });
    }

    let lecturer = null;

    if (lecturerId) {
      lecturer = await prisma.user.findUnique({
        where: {
          id: lecturerId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          departmentId: true,
        },
      });

      if (!lecturer || lecturer.role !== 'TEACHER') {
        return res.status(400).json({
          error: 'Selected lecturer is not a teacher',
        });
      }
    }

    const overlappingEntries =
      await prisma.timetableEntry.findMany({
        where: {
          termId: term.id,
          dayOfWeek,
          startTime: {
            lt: endTime,
          },
          endTime: {
            gt: startTime,
          },
        },
        include: {
          unit: true,
          lecturer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    const unitConflict = overlappingEntries.find(
      (entry) => entry.unitId === unitId
    );

    if (unitConflict) {
      return res.status(409).json({
        error:
          'This unit is already scheduled during this time',
      });
    }

    if (lecturerId) {
      const lecturerConflict =
        overlappingEntries.find(
          (entry) => entry.lecturerId === lecturerId
        );

      if (lecturerConflict) {
        return res.status(409).json({
          error:
            'This lecturer is already teaching another unit during this time',
        });
      }
    }

    if (room) {
      const roomConflict = overlappingEntries.find(
        (entry) =>
          entry.room &&
          entry.room.trim().toLowerCase() ===
            String(room).trim().toLowerCase()
      );

      if (roomConflict) {
        return res.status(409).json({
          error:
            'This room is already occupied during this time',
        });
      }
    }

    const entry = await prisma.timetableEntry.create({
      data: {
        termId: term.id,
        unitId,
        lecturerId: lecturerId || null,
        dayOfWeek,
        startTime,
        endTime,
        room: room || null,
        notes: notes || null,
      },
      include: {
        unit: {
          include: {
            program: true,
          },
        },
        lecturer: {
          select: {
            id: true,
            name: true,
            email: true,
            departmentId: true,
          },
        },
        term: true,
      },
    });

    res.status(201).json(entry);
  }
);

// Delete timetable entry.
router.delete(
  '/timetable/entries/:id',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { id } = req.params;

    const existing =
      await prisma.timetableEntry.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      return res.status(404).json({
        error: 'Timetable entry not found',
      });
    }

    await prisma.timetableEntry.delete({
      where: {
        id,
      },
    });

    res.json({
      message: 'Timetable entry deleted',
    });
  }
);


export default router;
