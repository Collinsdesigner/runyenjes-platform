// RUNYENJES-SETUP-V1
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { validate } from '../middleware/validate';
import { uploadImage } from '../services/media.service';
import { MODULES, MODULE_KEYS } from '../config/modules';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

class SetupClosedError extends Error {}

// Setup is open only while no ADMIN user exists. This is derived from the
// users table on purpose: a settings flag could be reset or faked.
async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: 'ADMIN' } })) === 0;
}

async function requireSetupOpen(_req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await needsSetup())) {
      return res.status(403).json({ message: 'Setup has already been completed.' });
    }
    next();
  } catch (error) {
    console.error('Setup guard error:', error);
    res.status(500).json({ message: 'Could not check setup status.' });
  }
}

function sameSecret(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// If SETUP_TOKEN is set in the environment, setup calls must send it in the
// x-setup-token header. If it is not set, setup works without one.
function requireSetupToken(req: Request, res: Response, next: NextFunction) {
  if (!env.SETUP_TOKEN) return next();
  const given = req.header('x-setup-token') ?? '';
  if (!sameSecret(given, env.SETUP_TOKEN)) {
    return res.status(401).json({ message: 'Invalid setup token.' });
  }
  next();
}

// ---------- GET /setup/status (public) ----------
router.get('/status', async (_req, res) => {
  try {
    const open = await needsSetup();
    res.json({
      needsSetup: open,
      tokenRequired: open && !!env.SETUP_TOKEN,
      modules: open ? MODULES : [],
    });
  } catch (error) {
    console.error('Setup status error:', error);
    res.status(500).json({ message: 'Could not check setup status.' });
  }
});

// ---------- GET /setup/readiness ----------
// Reports pass/fail per deployment requirement. Never returns secret values.
router.get('/readiness', requireSetupOpen, requireSetupToken, async (_req, res) => {
  type Check = { key: string; label: string; status: 'pass' | 'fail' | 'warn'; fix?: string };
  const checks: Check[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ key: 'database', label: 'Database connection', status: 'pass' });
  } catch {
    checks.push({
      key: 'database', label: 'Database connection', status: 'fail',
      fix: 'Check DATABASE_URL in your backend environment variables.',
    });
  }

  const cloudinaryOk =
    !!env.CLOUDINARY_CLOUD_NAME && !!env.CLOUDINARY_API_KEY && !!env.CLOUDINARY_API_SECRET;
  checks.push(
    cloudinaryOk
      ? { key: 'cloudinary', label: 'Media storage (Cloudinary)', status: 'pass' }
      : {
          key: 'cloudinary', label: 'Media storage (Cloudinary)', status: 'fail',
          fix: 'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
        }
  );

  checks.push(
    process.env.FRONTEND_URL
      ? { key: 'frontendUrl', label: 'Frontend address (CORS)', status: 'pass' }
      : {
          key: 'frontendUrl', label: 'Frontend address (CORS)', status: 'fail',
          fix: 'Set FRONTEND_URL to your deployed frontend address, e.g. https://yourschool.vercel.app.',
        }
  );

  const secret = env.JWT_SECRET || '';
  const weak = secret.length < 32 || /^(secret|changeme|jwt|test|password)/i.test(secret);
  checks.push(
    weak
      ? {
          key: 'jwtSecret', label: 'Login security key (JWT_SECRET)', status: 'fail',
          fix: 'Set JWT_SECRET to a random string of at least 32 characters.',
        }
      : { key: 'jwtSecret', label: 'Login security key (JWT_SECRET)', status: 'pass' }
  );

  checks.push(
    env.SETUP_TOKEN
      ? { key: 'setupToken', label: 'Setup token', status: 'pass' }
      : {
          key: 'setupToken', label: 'Setup token', status: 'warn',
          fix: 'Recommended: set SETUP_TOKEN so only you can finish setup, then remove it afterwards.',
        }
  );

  checks.push(
    env.GROQ_API_KEY
      ? { key: 'ai', label: 'AI assistant (Groq)', status: 'pass' }
      : {
          key: 'ai', label: 'AI assistant (Groq)', status: 'warn',
          fix: 'Optional: set GROQ_API_KEY to enable AI features.',
        }
  );

  res.json({ ready: !checks.some((c) => c.status === 'fail'), checks });
});

// ---------- POST /setup/logo ----------
router.post('/logo', requireSetupOpen, requireSetupToken, (req, res) => {
  upload.single('logo')(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({ message: (err as Error).message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No logo uploaded' });
    }
    try {
      const image = await uploadImage(req.file, 'institution');
      res.json({ logoUrl: image.secureUrl, logoPublicId: image.publicId });
    } catch (error) {
      console.error('Setup logo upload failed:', error);
      res.status(500).json({
        message: 'Logo upload failed. Check your Cloudinary settings on the readiness step.',
      });
    }
  });
});

// ---------- POST /setup/complete ----------
const ALL_ROLES = Object.values(Role) as Role[];
// Default audience for an external-system card: staff, not students/alumni.
const DEFAULT_LINK_ROLES = ALL_ROLES.filter((r) => r !== 'STUDENT' && r !== 'ALUMNI');

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #0B7A2B');

const urlField = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'URL must start with http:// or https://');

const completeSchema = z.object({
  institution: z.object({
    institutionName: z.string().trim().min(2).max(200),
    shortName: z.string().trim().min(1).max(60),
    tagline: z.string().trim().max(200).default(''),
    address: z.string().trim().min(1).max(300),
    phone: z.string().trim().min(5).max(40),
    email: z.string().trim().email().max(200),
    website: z.string().trim().max(200).default(''),
    physicalLocation: z.string().trim().max(300).optional(),
    googleMapsUrl: z.string().trim().max(500).optional(),
  }),
  branding: z.object({
    primaryColor: hex,
    secondaryColor: hex,
    logoUrl: z.string().trim().url().max(500).optional(),
    logoPublicId: z.string().trim().max(300).optional(),
  }),
  modules: z.record(z.string(), z.boolean()).default({}),
  externalSystems: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        url: urlField,
        visibleToRoles: z.array(z.enum(ALL_ROLES as [Role, ...Role[]])).default([]),
      })
    )
    .max(20)
    .default([]),
  admin: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    password: z.string().min(8).max(128),
  }),
});

type CompleteBody = z.infer<typeof completeSchema>;

router.post(
  '/complete',
  requireSetupOpen,
  requireSetupToken,
  validate(completeSchema),
  async (req, res) => {
    const d = req.body as CompleteBody;

    const unknownModules = Object.keys(d.modules).filter((k) => !MODULE_KEYS.includes(k));
    if (unknownModules.length > 0) {
      return res.status(400).json({ message: `Unknown module(s): ${unknownModules.join(', ')}` });
    }

    try {
      const passwordHash = await bcrypt.hash(d.admin.password, 12);

      await prisma.$transaction(
        async (tx) => {
          // Serialize concurrent setup attempts, then re-check inside the lock.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(827364)`;
          if ((await tx.user.count({ where: { role: 'ADMIN' } })) > 0) {
            throw new SetupClosedError();
          }

          const identity = {
            institutionName: d.institution.institutionName,
            shortName: d.institution.shortName,
            tagline: d.institution.tagline,
            address: d.institution.address,
            phone: d.institution.phone,
            email: d.institution.email,
            website: d.institution.website,
            physicalLocation: d.institution.physicalLocation ?? null,
            googleMapsUrl: d.institution.googleMapsUrl ?? null,
            primaryColor: d.branding.primaryColor,
            secondaryColor: d.branding.secondaryColor,
            logoUrl: d.branding.logoUrl ?? null,
            logoPublicId: d.branding.logoPublicId ?? null,
          };

          await tx.siteSettings.upsert({
            where: { id: 1 },
            update: identity,
            create: { id: 1, ...identity },
          });

          await tx.moduleSetting.deleteMany();
          await tx.moduleSetting.createMany({
            data: MODULE_KEYS.map((key) => ({ key, enabled: d.modules[key] ?? true })),
          });

          await tx.externalSystem.deleteMany();
          if (d.externalSystems.length > 0) {
            await tx.externalSystem.createMany({
              data: d.externalSystems.map((s, i) => ({
                name: s.name,
                url: s.url,
                visibleToRoles: s.visibleToRoles.length > 0 ? s.visibleToRoles : DEFAULT_LINK_ROLES,
                sortOrder: i,
              })),
            });
          }

          await tx.user.create({
            data: {
              name: d.admin.name,
              email: d.admin.email,
              passwordHash,
              role: 'ADMIN',
              status: 'ACTIVE',
              mustChangePassword: false,
              passwordChangedAt: new Date(),
            },
          });
        },
        { timeout: 20000, maxWait: 10000 }
      );

      res.status(201).json({ message: 'Setup complete. You can now log in.' });
    } catch (error) {
      if (error instanceof SetupClosedError) {
        return res.status(403).json({ message: 'Setup has already been completed.' });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ message: 'An account with that email already exists.' });
      }
      console.error('Setup complete failed:', error);
      res.status(500).json({ message: 'Setup failed. Nothing was saved. Please try again.' });
    }
  }
);

export default router;
