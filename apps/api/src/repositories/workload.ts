import type { Prisma } from '../generated/prisma/client.js';
import type { WorkloadQuery } from '../services/coordination-validation.js';

export async function workload(tx: Prisma.TransactionClient, projectId: string, query: WorkloadQuery) {
  const periodStart = new Date(query.periodStart); const periodEnd = new Date(query.periodEnd);
  const where: Prisma.TaskWhereInput = { projectId, status: { not: 'DONE' }, AND: [
    { OR: [{ startDate: null }, { startDate: { lte: periodEnd } }] },
    { OR: [{ dueDate: null }, { dueDate: { gte: periodStart } }] },
  ] };
  const members = await tx.projectMember.findMany({ where: { projectId }, orderBy: { userId: 'asc' }, skip: (query.page - 1) * 20, take: 20, include: { workspaceMember: { include: { user: { select: { id: true, displayName: true, email: true, status: true } } } } } });
  const ids = members.map((member) => member.userId);
  const groups = await tx.task.groupBy({ by: ['assigneeId'], where: { ...where, assigneeId: { in: ids } }, _sum: { effort: true }, _count: { _all: true, effort: true } });
  const capacities = await tx.memberCapacity.findMany({ where: { projectId, userId: { in: ids }, periodStart, periodEnd } });
  const total = await tx.projectMember.count({ where: { projectId } });
  const overview = await tx.task.aggregate({ where, _sum: { effort: true }, _count: { _all: true, effort: true } });
  const unassigned = await tx.task.aggregate({ where: { ...where, assigneeId: null }, _sum: { effort: true }, _count: { _all: true, effort: true } });
  return { periodStart: query.periodStart, periodEnd: query.periodEnd, page: query.page, pageSize: 20, total,
    summary: { taskCount: overview._count._all, knownEffort: overview._sum.effort ?? 0, missingEffortCount: overview._count._all - overview._count.effort, unassignedCount: unassigned._count._all, unassignedEffort: unassigned._sum.effort ?? 0 },
    items: members.map((member) => {
      const group = groups.find((item) => item.assigneeId === member.userId); const capacity = capacities.find((item) => item.userId === member.userId) ?? null;
      const knownEffort = group?._sum.effort ?? 0; const taskCount = group?._count._all ?? 0;
      const missingEffortCount = taskCount - (group?._count.effort ?? 0);
      const percent = capacity ? Math.round(knownEffort / capacity.capacityPoints * 10000) / 100 : null;
      return { user: member.workspaceMember.user, taskCount, knownEffort, missingEffortCount, capacity, percent, overloaded: capacity !== null && knownEffort > capacity.capacityPoints, complete: capacity !== null && missingEffortCount === 0 };
    }),
  };
}
