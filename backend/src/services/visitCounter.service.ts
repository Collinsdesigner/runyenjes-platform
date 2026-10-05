// VISIT_STATS_V1 -- lazy weekly reset, no cron job (checked on every read/write)
import { prisma } from '../lib/prisma';

const RESET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // weekly

async function getCurrentCounter() {
  let counter = await prisma.visitCounter.findUnique({ where: { id: 1 } });

  if (!counter) {
    counter = await prisma.visitCounter.create({
      data: { id: 1, count: 0, periodStart: new Date() },
    });
  }

  const periodAge = Date.now() - counter.periodStart.getTime();

  if (periodAge >= RESET_PERIOD_MS) {
    counter = await prisma.visitCounter.update({
      where: { id: 1 },
      data: { count: 0, periodStart: new Date() },
    });
  }

  return counter;
}

export async function recordVisit() {
  await getCurrentCounter();

  return prisma.visitCounter.update({
    where: { id: 1 },
    data: { count: { increment: 1 } },
  });
}

export async function getVisitStats() {
  const counter = await getCurrentCounter();
  const nextResetAt = new Date(counter.periodStart.getTime() + RESET_PERIOD_MS);

  return {
    count: counter.count,
    periodStart: counter.periodStart,
    nextResetAt,
  };
}
