import { prisma } from '../lib/prisma';

// Generates admission numbers like RTVC/2026/00001, sequential per year.
export async function generateAdmissionNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RTVC/${year}/`;

  const count = await prisma.user.count({
    where: { admissionNumber: { startsWith: prefix } },
  });

  const next = (count + 1).toString().padStart(5, '0');
  return `${prefix}${next}`;
}
