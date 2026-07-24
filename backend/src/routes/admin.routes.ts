import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// All admin routes require Admin or Founder. (Registrar has its own scoped
// routes under /applications and /terms — this dashboard is broader.)
router.use(requireAuth, requireRole('ADMIN', 'FOUNDER'));

// ---------- Quick stats for the dashboard home ----------
router.get('/stats', async (req, res) => {
  const [students, teachers, departments, pendingApplications, visitCounter] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
    prisma.department.count(),
    prisma.application.count({ where: { status: 'SUBMITTED' } }),
    prisma.visitCounter.findUnique({ where: { id: 1 } }),
  ]);
  res.json({
    students,
    teachers,
    departments,
    pendingApplications,
    homeVisits: visitCounter?.count ?? 0,
  });
});

// ---------- List users — searchable, filterable, sortable, paginated ----------
router.get('/users', async (req, res) => {
  const {
    search,
    role,
    departmentId,
    status,
    sortBy = 'createdAt',
    sortDir = 'desc',
    page = '1',
    pageSize = '50',
  } = req.query as Record<string, string>;

  const where: any = {};
  if (role) where.role = role;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { admissionNumber: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const sortableFields = ['name', 'admissionNumber', 'createdAt', 'role'];
  const orderBy = sortableFields.includes(sortBy)
    ? { [sortBy]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' as const };

  const take = Math.min(parseInt(pageSize) || 50, 200);
  const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        admissionNumber: true,
        department: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy,
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page: Number(page), pageSize: take, totalPages: Math.ceil(total / take) });
});

// ---------- Create a staff account (Teacher, Admin, or Registrar) ----------
router.post('/users', async (req, res) => {
  const { name, email, password, role, departmentId, phone } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }
  if (!['TEACHER', 'ADMIN', 'REGISTRAR'].includes(role)) {
    return res.status(400).json({ error: 'Role must be TEACHER, ADMIN, or REGISTRAR' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone: phone || null, passwordHash, role, departmentId: departmentId || null },
    select: { id: true, name: true, email: true, phone: true, role: true, status: true },
  });

  const groupsToJoin = await prisma.group.findMany({
    where: {
      OR: [
        departmentId ? { type: 'DEPARTMENT', departmentId } : undefined,
        role === 'TEACHER' ? { type: 'TEACHERS' } : undefined,
        role === 'ADMIN' ? { type: 'ADMINS' } : undefined,
        { type: 'SCHOOL' },
      ].filter(Boolean) as any,
    },
  });
  if (groupsToJoin.length) {
    await prisma.groupMember.createMany({
      data: groupsToJoin.map((g) => ({ groupId: g.id, userId: user.id })),
      skipDuplicates: true,
    });
  }

  res.status(201).json(user);
});

// ---------- Suspend or reactivate a user ----------
router.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'FOUNDER') {
    return res.status(403).json({ error: 'The Founder account cannot be modified here' });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, name: true, status: true },
  });
  res.json(user);
});

// ---------- Reset a staff member's password (Admin/Founder only) ----------
router.post('/users/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'FOUNDER') {
    return res.status(403).json({ error: 'The Founder account cannot be modified here' });
  }
  if (!target.passwordHash) {
    return res.status(400).json({ error: 'Students log in with their admission number, not a password' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  res.json({ success: true });
});

// ---------- Change a staff member's department after creation ----------
router.patch('/users/:id/department', async (req, res) => {
  const { id } = req.params;
  const { departmentId } = req.body;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'FOUNDER') {
    return res.status(403).json({ error: 'The Founder account cannot be modified here' });
  }

  if (target.departmentId) {
    const oldGroup = await prisma.group.findFirst({
      where: { type: 'DEPARTMENT', departmentId: target.departmentId },
    });
    if (oldGroup) {
      await prisma.groupMember.deleteMany({ where: { groupId: oldGroup.id, userId: id } });
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { departmentId: departmentId || null },
    select: { id: true, name: true, department: { select: { id: true, name: true } } },
  });

  if (departmentId) {
    const newGroup = await prisma.group.findFirst({ where: { type: 'DEPARTMENT', departmentId } });
    if (newGroup) {
      await prisma.groupMember
        .create({ data: { groupId: newGroup.id, userId: id } })
        .catch(() => {});
    }
  }

  res.json(updated);
});

// ---------- Create a new department ----------
router.post('/departments', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Department name is required' });

  const existing = await prisma.department.findUnique({ where: { name: name.trim() } });
  if (existing) return res.status(409).json({ error: 'A department with this name already exists' });

  const department = await prisma.department.create({ data: { name: name.trim() } });

  await prisma.group.create({
    data: { type: 'DEPARTMENT', departmentId: department.id, name: `${department.name} — Department` },
  });

  res.status(201).json(department);
});

// ---------- Rename a department ----------
router.patch('/departments/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Department name is required' });

  const department = await prisma.department.update({
    where: { id },
    data: { name: name.trim() },
  });
  res.json(department);
});

// ---------- Delete a department (only if it has no programs left) ----------
router.delete('/departments/:id', async (req, res) => {
  const { id } = req.params;

  const programCount = await prisma.program.count({ where: { departmentId: id } });
  if (programCount > 0) {
    return res.status(400).json({
      error: `This department still has ${programCount} program(s). Remove or move them first.`,
    });
  }

  const group = await prisma.group.findFirst({ where: { type: 'DEPARTMENT', departmentId: id } });
  if (group) {
    await prisma.groupMember.deleteMany({ where: { groupId: group.id } });
    await prisma.message.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
  }

  await prisma.department.delete({ where: { id } });
  res.status(204).send();
});

// ---------- Add a program (and its level) to a department ----------
router.post('/departments/:departmentId/programs', async (req, res) => {
  const { departmentId } = req.params;
  const { name, level, entryRequirements, examBody, isShortCourse } = req.body;

  if (!name) return res.status(400).json({ error: 'Program name is required' });

  const program = await prisma.program.create({
    data: {
      departmentId,
      name,
      level: level || null,
      entryRequirements: entryRequirements || null,
      examBody: examBody || 'TVET CDACC',
      isShortCourse: Boolean(isShortCourse),
    },
  });

  const group = await prisma.group.create({
    data: {
      type: 'CLASS',
      programId: program.id,
      name: `${name}${level ? ` ${level}` : ''}`,
    },
  });

  res.status(201).json({ program, group });
});

// ---------- Edit a program's details ----------
router.patch('/programs/:id', async (req, res) => {
  const { id } = req.params;
  const { name, level, entryRequirements, examBody } = req.body;

  const program = await prisma.program.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(level !== undefined && { level: level || null }),
      ...(entryRequirements !== undefined && { entryRequirements: entryRequirements || null }),
      ...(examBody !== undefined && { examBody }),
    },
  });

  const group = await prisma.group.findUnique({ where: { programId: id } });
  if (group) {
    await prisma.group.update({
      where: { id: group.id },
      data: { name: `${program.name}${program.level ? ` ${program.level}` : ''}` },
    });
  }

  res.json(program);
});

// ---------- Delete a program (only if no students are enrolled in its class) ----------
router.delete('/programs/:id', async (req, res) => {
  const { id } = req.params;

  const group = await prisma.group.findUnique({ where: { programId: id } });
  if (group) {
    const memberCount = await prisma.groupMember.count({ where: { groupId: group.id } });
    if (memberCount > 0) {
      return res.status(400).json({
        error: `This class still has ${memberCount} member(s) enrolled. It can't be deleted while students belong to it.`,
      });
    }
    await prisma.message.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
  }

  const units = await prisma.unit.findMany({ where: { programId: id } });
  for (const unit of units) {
    await prisma.material.deleteMany({ where: { unitId: unit.id } });
  }
  await prisma.unit.deleteMany({ where: { programId: id } });
  await prisma.programFee.deleteMany({ where: { programId: id } });

  await prisma.program.delete({ where: { id } });
  res.status(204).send();
});

// ---------- Set/update a program's fee (versioned — past applicants keep what they were charged) ----------
router.post('/programs/:id/fee', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive fee amount is required' });
  }

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const fee = await prisma.programFee.create({
    data: { programId: id, amount: Math.round(Number(amount)) },
  });

  res.status(201).json(fee);
});

// ---------- Bulk-import existing students (for launch day, not new applicants) ----------
router.post('/programs/:programId/bulk-import-students', async (req, res) => {
  const { programId } = req.params;
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Provide at least one student row' });
  }

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const [classGroup, deptGroup, schoolGroup] = await Promise.all([
    prisma.group.findUnique({ where: { programId } }),
    prisma.group.findFirst({ where: { type: 'DEPARTMENT', departmentId: program.departmentId } }),
    prisma.group.findFirst({ where: { type: 'SCHOOL' } }),
  ]);
  const groupIds = [classGroup?.id, deptGroup?.id, schoolGroup?.id].filter(
    (id): id is string => Boolean(id)
  );

  const created: string[] = [];
  const skipped: { row: any; reason: string }[] = [];

  for (const row of rows) {
    const { name, email, admissionNumber, phone } = row;
    if (!name || !email || !admissionNumber) {
      skipped.push({ row, reason: 'Missing name, email, or admission number' });
      continue;
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { admissionNumber }] },
    });
    if (existing) {
      skipped.push({ row, reason: 'Email or admission number already exists' });
      continue;
    }

    const student = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        admissionNumber,
        role: 'STUDENT',
        departmentId: program.departmentId,
      },
    });

    if (groupIds.length) {
      await prisma.groupMember.createMany({
        data: groupIds.map((groupId) => ({ groupId, userId: student.id })),
        skipDuplicates: true,
      });
    }

    created.push(`${name} (${admissionNumber})`);
  }

  res.json({ createdCount: created.length, created, skippedCount: skipped.length, skipped });
});

// ---------- Set/update a program's fee (versioned — old fee stays historical) ----------
router.post('/programs/:id/fee', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive fee amount is required' });
  }

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const fee = await prisma.programFee.create({
    data: { programId: id, amount: Number(amount), setBy: req.user!.userId },
  });

  res.status(201).json(fee);
});

// ---------- Update site settings (name, branding, contact info) ----------
// This is what makes the blueprint's promise real: renaming the college,
// changing colors, or updating contact info is a form edit here, not a
// code change or redeployment.
router.patch('/settings', async (req, res) => {
  const {
    institutionName,
    shortName,
    tagline,
    logoUrl,
    primaryColor,
    secondaryColor,
    address,
    phone,
    email,
    website,
  } = req.body;

  const settings = await prisma.siteSettings.update({
    where: { id: 1 },
    data: {
      ...(institutionName !== undefined && { institutionName }),
      ...(shortName !== undefined && { shortName }),
      ...(tagline !== undefined && { tagline }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(secondaryColor !== undefined && { secondaryColor }),
      ...(address !== undefined && { address }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(website !== undefined && { website }),
    },
  });

  res.json(settings);
});

// ---------- Repair missing group memberships ----------
// Fixes accounts (like the originally-seeded Founder/Admin/Registrar) that
// were created directly in the database without being placed in their
// Teachers/Admins/Department/School chat groups.
router.post('/repair-group-memberships', async (req, res) => {
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' } });
  const schoolGroup = await prisma.group.findFirst({ where: { type: 'SCHOOL' } });
  const teachersGroup = await prisma.group.findFirst({ where: { type: 'TEACHERS' } });
  const adminsGroup = await prisma.group.findFirst({ where: { type: 'ADMINS' } });

  let fixedCount = 0;

  for (const u of users) {
    const groupIds: string[] = [];
    if (schoolGroup) groupIds.push(schoolGroup.id);
    if ((u.role === 'TEACHER' || u.role === 'FOUNDER') && teachersGroup) groupIds.push(teachersGroup.id);
    if ((u.role === 'ADMIN' || u.role === 'FOUNDER') && adminsGroup) groupIds.push(adminsGroup.id);

    if (u.departmentId) {
      const deptGroup = await prisma.group.findFirst({
        where: { type: 'DEPARTMENT', departmentId: u.departmentId },
      });
      if (deptGroup) groupIds.push(deptGroup.id);
    }

    if (groupIds.length) {
      const result = await prisma.groupMember.createMany({
        data: groupIds.map((groupId) => ({ groupId, userId: u.id })),
        skipDuplicates: true,
      });
      fixedCount += result.count;
    }
  }

  res.json({ message: `Repaired ${fixedCount} missing group membership(s).` });
});

export default router;
