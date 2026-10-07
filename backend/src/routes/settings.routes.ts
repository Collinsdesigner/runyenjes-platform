// RUNYENJES-SETUP-V1
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { MODULE_KEYS } from '../config/modules';

const router = Router();

// Public — the frontend uses this to show the right name/colors/logo and to
// know which optional modules are switched on. On a fresh install there is no
// SiteSettings row yet, so this returns { configured: false, ... } instead of
// null (reading a field off null would crash the frontend).
// Unknown/missing module rows default to enabled, so existing deployments
// keep every module on without any data change.
router.get('/', async (_req, res) => {
  try {
    const [settings, rows] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
      prisma.moduleSetting.findMany(),
    ]);

    const modules: Record<string, boolean> = Object.fromEntries(
      MODULE_KEYS.map((k) => [k, true])
    );
    for (const row of rows) {
      if (row.key in modules) modules[row.key] = row.enabled;
    }

    res.json({ ...(settings ?? {}), configured: !!settings, modules });
  } catch (error) {
    console.error('Settings fetch failed:', error);
    res.status(500).json({ message: 'Could not load settings.' });
  }
});

export default router;
