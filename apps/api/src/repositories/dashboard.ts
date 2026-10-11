import type { Prisma } from '../generated/prisma/client.js';

export async function taskDashboard(tx: Prisma.TransactionClient, where: Prisma.TaskWhereInput, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${today}T00:00:00Z`); const week = new Date(date); week.setUTCDate(week.getUTCDate() + 7);
  const active: Prisma.TaskWhereInput = { AND: [where, { status: { not: 'DONE' } }] };
  const blocked: Prisma.TaskWhereInput = { dependencies: { some: { dependsOnTask: { status: { not: 'DONE' } } } } };
  const groups = await tx.task.groupBy({ by: ['status'], where, _count: { _all: true } });
  const counts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 }; for (const group of groups) counts[group.status] = group._count._all;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const effort = await tx.task.aggregate({ where: active, _sum: { effort: true } });
  return { today, total, counts, progressPercent: total ? Math.round(counts.DONE / total * 10000) / 100 : null,
    activeCount: total - counts.DONE, activeKnownEffort: effort._sum.effort ?? 0,
    overdueCount: await tx.task.count({ where: { AND: [active, { dueDate: { lt: date } }] } }),
    dueSoonCount: await tx.task.count({ where: { AND: [active, { dueDate: { gte: date, lte: week } }] } }),
    blockedCount: await tx.task.count({ where: { AND: [active, blocked] } }),
    missingEffortCount: await tx.task.count({ where: { AND: [active, { effort: null }] } }),
    missingDeadlineCount: await tx.task.count({ where: { AND: [active, { dueDate: null }] } }),
    unassignedCount: await tx.task.count({ where: { AND: [active, { assigneeId: null }] } }),
    attention: await tx.task.findMany({ where: { AND: [active, { OR: [blocked, { dueDate: { lte: week } }] }] }, orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], take: 10,
      select: { id: true, title: true, status: true, dueDate: true, project: { select: { name: true } }, dependencies: { where: { dependsOnTask: { status: { not: 'DONE' } } }, take: 1, select: { dependsOnTaskId: true } } } }),
  };
}
