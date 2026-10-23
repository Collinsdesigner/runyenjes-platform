// RUNYENJES-SETUP-V1
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { MODULE_KEYS, normalizeModules } from '../config/modules';

// Which areas are switched on. A missing row means on. Cached briefly so a
// request does not need a database query just to check a switch.
let cache: { at: number; map: Record<string, boolean> } | null = null;

export function clearModuleCache(): void {
  cache = null;
}

export async function getModules(): Promise<Record<string, boolean>> {
  if (cache && Date.now() - cache.at < 20_000) return cache.map;
  const base: Record<string, boolean> = Object.fromEntries(MODULE_KEYS.map((k) => [k, true]));
  try {
    const rows = await prisma.moduleSetting.findMany();
    for (const r of rows) {
      if (r.key in base) base[r.key] = r.enabled;
    }
    const map = normalizeModules(base);
    cache = { at: Date.now(), map };
    return map;
  } catch {
    return cache ? cache.map : normalizeModules(base);
  }
}

export async function isModuleEnabled(key: string): Promise<boolean> {
  return (await getModules())[key] !== false;
}

// Refuses a whole area when it is switched off. Fails open: if the switch
// cannot be read, the area keeps working.
export function requireModule(key: string) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (await isModuleEnabled(key)) return next();
      return res
        .status(403)
        .json({ error: "This area is handled in your institution's own system." });
    } catch {
      return next();
    }
  };
}
