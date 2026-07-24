import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Public — the frontend uses this to show the right name/colors/logo,
// so a future rename (College -> Institute) needs zero code changes.
router.get('/', async (req, res) => {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  res.json(settings);
});

export default router;
