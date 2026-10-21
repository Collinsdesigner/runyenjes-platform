import { MODULES, MODULE_KEYS, MODULE_AUDIENCE, normalizeModules } from '../config/modules';
import { clearModuleCache } from '../middleware/modules';
import { Role as RoleEnum } from '@prisma/client';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { uploadImage, deleteImage } from '../services/media.service';
import { getVisitStats } from '../services/visitCounter.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// All admin routes require Admin or Founder. (Registrar has its own scoped
// routes under /applications and /terms — this dashboard is broader.)
router.use(requireAuth, requireRole('ADMIN'));
// ---------- Quick stats for the dashboard home ----------
router.get('/stats', async (req, res) => {
  const [students, teachers, departments, pendingApplications, visitCounter] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
    prisma.department.count(),
    prisma.application.count({ where: { status: 'SUBMITTED' } }),
    getVisitStats(),
  ]);
  res.json({
    students,
    teachers,
    departments,
    pendingApplications,
    homeVisits: visitCounter.count,
    homeVisitsResetAt: visitCounter.nextResetAt,
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
  const creatableRoles = [
    'TEACHER',
    'ADMIN',
    'REGISTRAR',
    'FINANCE_OFFICER',
    'HR_OFFICER',
    'EXAM_OFFICER',
    'STORES_OFFICER',
    'SUPPORT_STAFF',
    'PROCUREMENT_OFFICER',
  ];
  if (!creatableRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${creatableRoles.join(', ')}` });
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

  await logAudit({
    actorId: req.user!.userId,
    action: 'CREATE_STAFF_USER',
    entityType: 'User',
    entityId: user.id,
    after: { name: user.name, email: user.email, role: user.role },
  });

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

  const user = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, name: true, status: true },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_USER_STATUS',
    entityType: 'User',
    entityId: id,
    before: { status: target.status },
    after: { status: user.status },
  });

  res.json(user);
});

// ---------- Grant or change a user's role ----------
// This is how privileges are granted/revoked from now on — through the
// platform, not by editing code or seed data. Any role, including the
// newer ERP officer roles, can be assigned here by an Admin.
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const assignableRoles = [
    'ADMIN',
    'REGISTRAR',
    'TEACHER',
    'STUDENT',
    'FINANCE_OFFICER',
    'HR_OFFICER',
    'EXAM_OFFICER',
    'STORES_OFFICER',
    'SUPPORT_STAFF',
    'PROCUREMENT_OFFICER',
    'ALUMNI',
  ];
  if (!assignableRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${assignableRoles.join(', ')}` });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_USER_ROLE',
    entityType: 'User',
    entityId: id,
    before: { role: target.role },
    after: { role: user.role },
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
  if (!target.passwordHash) {
    return res.status(400).json({ error: 'Students log in with their admission number, not a password' });
  }


const passwordHash = await bcrypt.hash(newPassword, 10);

await prisma.user.update({
  where: { id },
  data: {
    passwordHash,
    mustChangePassword: true,
    passwordChangedAt: null,
  },
});

await logAudit({
  actorId: req.user!.userId,
  action: 'RESET_USER_PASSWORD',
  entityType: 'User',
  entityId: id,
  after: { targetName: target.name },
});

res.json({ success: true });
});

// ---------- Change a staff member's department after creation ----------
router.patch('/users/:id/department', async (req, res) => {
  const { id } = req.params;
  const { departmentId } = req.body;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

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

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_USER_DEPARTMENT',
    entityType: 'User',
    entityId: id,
    before: { departmentId: target.departmentId },
    after: { departmentId: updated.department?.id ?? null },
  });

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

  const departmentBefore = await prisma.department.findUnique({ where: { id }, select: { name: true } });

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

  await logAudit({
    actorId: req.user!.userId,
    action: 'DELETE_DEPARTMENT',
    entityType: 'Department',
    entityId: id,
    before: departmentBefore,
  });

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
      examBody: examBody || null,
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

  const programBefore = await prisma.program.findUnique({ where: { id }, select: { name: true, departmentId: true } });

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

  await logAudit({
    actorId: req.user!.userId,
    action: 'DELETE_PROGRAM',
    entityType: 'Program',
    entityId: id,
    before: programBefore,
  });

  res.status(204).send();
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

  await logAudit({
    actorId: req.user!.userId,
    action: 'SET_PROGRAM_FEE',
    entityType: 'ProgramFee',
    entityId: fee.id,
    after: { programId: id, amount: fee.amount },
  });

  res.status(201).json(fee);
});

// ---------- Update site settings (name, branding, contact info) ----------
// This is what makes the blueprint's promise real: renaming the institution,
// changing colors, or updating contact info is a form edit here, not a
// code change or redeployment.
// SITE_SETTINGS_HIGHLIGHTS_V1
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
    about,
    physicalLocation,
    googleMapsUrl,
    highlightsTitle,
    highlightsBody,
    mpesaPaybill,
    mpesaAccountNumber,
    intakeOptions,
    admissionNumberExample,
  } = req.body;

  const settingsBefore = await prisma.siteSettings.findUnique({ where: { id: 1 } });

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
      ...(about !== undefined && { about }),
      ...(physicalLocation !== undefined && { physicalLocation }),
      ...(googleMapsUrl !== undefined && { googleMapsUrl }),
      ...(highlightsTitle !== undefined && { highlightsTitle }),
      ...(highlightsBody !== undefined && { highlightsBody }),
      ...(mpesaPaybill !== undefined && { mpesaPaybill }),
      ...(mpesaAccountNumber !== undefined && { mpesaAccountNumber }),
      ...(intakeOptions !== undefined && { intakeOptions }),
      ...(admissionNumberExample !== undefined && { admissionNumberExample }),
    },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_SITE_SETTINGS',
    entityType: 'SiteSettings',
    entityId: '1',
    before: settingsBefore,
    after: settings,
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
    if (u.role === 'TEACHER' && teachersGroup) {
      groupIds.push(teachersGroup.id);
    }

    if (u.role === 'ADMIN' && adminsGroup) {
      groupIds.push(adminsGroup.id);
    }
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

// ---------- Upload institution logo ----------
router.post('/institution-logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo uploaded' });
    }

    const current = await prisma.siteSettings.findUnique({
      where: { id: 1 },
    });

    // Delete old Cloudinary logo
    if (current?.logoPublicId) {
      await deleteImage(current.logoPublicId);
    }

    const image = await uploadImage(req.file, 'institution');

    const settings = await prisma.siteSettings.update({
      where: { id: 1 },
      data: {
        logoUrl: image.secureUrl,
        logoPublicId: image.publicId,
      },
    });

    res.json(settings);

  } catch (error) {
    console.error('Logo upload failed:', error);
    res.status(500).json({
      error: 'Logo upload failed',
    });
  }
});

// ---------- Modules & external systems (admin only, via router.use above) ----------
function isHttpUrlText(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const ALL_ROLE_VALUES = Object.values(RoleEnum) as RoleEnum[];
const STAFF_ROLE_VALUES = ALL_ROLE_VALUES.filter((r) => r !== 'STUDENT' && r !== 'ALUMNI');

router.get('/modules', async (_req, res) => {
  const rows = await prisma.moduleSetting.findMany();
  const links = await prisma.externalSystem.findMany({ where: { moduleKey: { not: null } } });
  const state: Record<string, boolean> = Object.fromEntries(MODULE_KEYS.map((k) => [k, true]));
  for (const r of rows) {
    if (r.key in state) state[r.key] = r.enabled;
  }
  const normalized = normalizeModules(state);
  res.json({
    modules: MODULES.map((m) => ({
      key: m.key,
      label: m.label,
      description: m.description,
      enabled: normalized[m.key],
      url: links.find((l) => l.moduleKey === m.key)?.url ?? '',
    })),
  });
});

router.put('/modules', async (req, res) => {
  const items = Array.isArray(req.body?.modules) ? req.body.modules : null;
  if (!items) return res.status(400).json({ error: 'A modules list is required.' });

  const wanted: Record<string, boolean> = Object.fromEntries(MODULE_KEYS.map((k) => [k, true]));
  const urls: Record<string, string> = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it.key !== 'string' || !MODULE_KEYS.includes(it.key)) {
      return res.status(400).json({ error: 'Unknown module in the list.' });
    }
    wanted[it.key] = it.enabled !== false;
    const url = typeof it.url === 'string' ? it.url.trim() : '';
    if (url && !isHttpUrlText(url)) {
      return res.status(400).json({ error: 'Each address must start with http:// or https://.' });
    }
    urls[it.key] = url;
  }
  const full = normalizeModules(wanted);
  const before = await prisma.moduleSetting.findMany();

  await prisma.$transaction(
    async (tx) => {
      for (const key of MODULE_KEYS) {
        await tx.moduleSetting.upsert({
          where: { key },
          update: { enabled: full[key] },
          create: { key, enabled: full[key] },
        });
        await tx.externalSystem.deleteMany({ where: { moduleKey: key } });
        if (!full[key] && urls[key]) {
          const mod = MODULES.find((m) => m.key === key)!;
          await tx.externalSystem.create({
            data: {
              name: mod.label,
              url: urls[key],
              moduleKey: key,
              visibleToRoles: MODULE_AUDIENCE[key] as RoleEnum[],
              sortOrder: 100,
            },
          });
        }
      }
    },
    { timeout: 20000, maxWait: 10000 }
  );

  clearModuleCache();
  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_MODULES',
    entityType: 'ModuleSetting',
    entityId: 'all',
    before,
    after: full,
  });
  res.json({ ok: true });
});

router.get('/external-systems', async (_req, res) => {
  const systems = await prisma.externalSystem.findMany({
    where: { moduleKey: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({
    systems: systems.map((s) => ({
      name: s.name,
      url: s.url,
      audience: s.visibleToRoles.includes('STUDENT' as RoleEnum)
        ? 'everyone'
        : s.visibleToRoles.length === 1 && s.visibleToRoles[0] === 'ADMIN'
        ? 'admins'
        : 'staff',
    })),
  });
});

router.put('/external-systems', async (req, res) => {
  const items = Array.isArray(req.body?.systems) ? req.body.systems : null;
  if (!items) return res.status(400).json({ error: 'A systems list is required.' });
  if (items.length > 20) return res.status(400).json({ error: 'At most 20 systems.' });

  const rows: { name: string; url: string; visibleToRoles: RoleEnum[]; sortOrder: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const name = String(it?.name ?? '').trim();
    const url = String(it?.url ?? '').trim();
    if (!name || name.length > 100 || !isHttpUrlText(url)) {
      return res
        .status(400)
        .json({ error: 'Each system needs a name and an address starting with http:// or https://.' });
    }
    const audience = it?.audience;
    rows.push({
      name,
      url,
      visibleToRoles:
        audience === 'everyone' ? ALL_ROLE_VALUES : audience === 'admins' ? (['ADMIN'] as RoleEnum[]) : STAFF_ROLE_VALUES,
      sortOrder: i,
    });
  }

  await prisma.$transaction([
    prisma.externalSystem.deleteMany({ where: { moduleKey: null } }),
    prisma.externalSystem.createMany({ data: rows }),
  ]);
  await logAudit({
    actorId: req.user!.userId,
    action: 'UPDATE_EXTERNAL_SYSTEMS',
    entityType: 'ExternalSystem',
    entityId: 'all',
    before: null,
    after: rows,
  });
  res.json({ ok: true });
});

export default router;
