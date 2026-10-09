// RUNYENJES-SETUP-V1
import { prisma } from '../lib/prisma';

// The institution's name for emails and AI prompts, read from settings and
// cached for a minute so a rename shows up quickly without a query per email.
let cache: { name: string; at: number } | null = null;

export async function getInstitutionName(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.name;
  try {
    const s = await prisma.siteSettings.findUnique({
      where: { id: 1 },
      select: { institutionName: true },
    });
    const name = s?.institutionName?.trim() || 'our institution';
    cache = { name, at: Date.now() };
    return name;
  } catch {
    return cache?.name ?? 'our institution';
  }
}
