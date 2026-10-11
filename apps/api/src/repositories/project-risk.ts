import type { Prisma, Project } from '../generated/prisma/client.js';

export async function projectRisk(tx: Prisma.TransactionClient, project: Pick<Project, 'id' | 'endDate'>, period: { periodStart: string; periodEnd: string }, now = new Date(), commitments: { sprintId?: string; taskIds?: string[] } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${today}T00:00:00Z`);
  const periodStart = new Date(period.periodStart); const periodEnd = new Date(period.periodEnd);
  const base = { projectId: project.id }; const active: Prisma.TaskWhereInput = { ...base, status: { not: 'DONE' } };
  const periodWhere: Prisma.TaskWhereInput = { ...active, OR: [
    { AND: [{ OR: [{ startDate: null }, { startDate: { lte: periodEnd } }] }, { OR: [{ dueDate: null }, { dueDate: { gte: periodStart } }] }] },
    ...(commitments.sprintId ? [{ sprintId: commitments.sprintId }] : []),
    ...(commitments.taskIds?.length ? [{ id: { in: commitments.taskIds } }] : []),
  ] };
  const totalTaskCount = await tx.task.count({ where: base });
  const doneCount = await tx.task.count({ where: { ...base, status: 'DONE' } });
  const activeCount = totalTaskCount - doneCount;
  const blockedCount = await tx.task.count({ where: { ...active, dependencies: { some: { dependsOnTask: { status: { not: 'DONE' } } } } } });
  const overdueCount = await tx.task.count({ where: { ...active, dueDate: { lt: date } } });
  const missingEffortCount = await tx.task.count({ where: { ...active, effort: null } });
  const missingDeadlineCount = await tx.task.count({ where: { ...active, dueDate: null } });
  const unassignedCount = await tx.task.count({ where: { ...active, assigneeId: null } });
  const groups = await tx.task.groupBy({ by: ['assigneeId'], where: periodWhere, _sum: { effort: true }, _count: { _all: true } });
  const ids = groups.flatMap((group) => group.assigneeId ? [group.assigneeId] : []);
  const capacities = await tx.memberCapacity.findMany({ where: { projectId: project.id, userId: { in: ids }, periodStart, periodEnd } });
  const members = await tx.projectMember.findMany({ where: { projectId: project.id, userId: { in: ids } }, select: { userId: true, workspaceMember: { select: { user: { select: { status: true } } } } } });
  const missingCapacityCount = ids.filter((id) => !capacities.some((item) => item.userId === id)).length;
  const unavailableAssigneeCount = ids.filter((id) => !members.some((member) => member.userId === id && member.workspaceMember.user.status === 'ACTIVE')).length;
  const overloadedCount = groups.filter((group) => { const capacity = capacities.find((item) => item.userId === group.assigneeId); return capacity && (group._sum.effort ?? 0) > capacity.capacityPoints; }).length;
  const sprints = await tx.sprint.findMany({ where: { projectId: project.id, status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true, startDate: true, endDate: true } });
  let lateActiveSprintCount = 0; let behindSprintCount = 0;
  for (const sprint of sprints) {
    const taskCount = await tx.task.count({ where: { ...base, sprintId: sprint.id } });
    const done = await tx.task.count({ where: { ...base, sprintId: sprint.id, status: 'DONE' } });
    if (!taskCount || done === taskCount) continue;
    if (sprint.endDate < date) lateActiveSprintCount++;
    // Compare exact ratios before rounding. This is a planning signal, not a velocity prediction.
    const duration = (sprint.endDate.getTime() - sprint.startDate.getTime()) / 86400000 + 1;
    const elapsed = Math.max(0, Math.min(duration, (date.getTime() - sprint.startDate.getTime()) / 86400000 + 1));
    if (done * duration < elapsed * taskCount) behindSprintCount++;
  }
  const projectOverdue = activeCount > 0 && Boolean(project.endDate && project.endDate < date);
  const signals: { code: string; severity: 'HIGH' | 'MEDIUM' | 'DATA'; count: number; message: string }[] = [];
  const signal = (code: string, severity: 'HIGH' | 'MEDIUM' | 'DATA', count: number, message: string) => { if (count) signals.push({ code, severity, count, message }); };
  signal('OVERDUE', 'HIGH', overdueCount, `${overdueCount} Task chưa DONE đã quá hạn.`);
  signal('OVERLOAD', 'HIGH', overloadedCount, `${overloadedCount} người phụ trách có Workload trên 100% trong kỳ.`);
  signal('LATE_SPRINT', 'HIGH', lateActiveSprintCount, `${lateActiveSprintCount} Sprint ACTIVE đã hết hạn và còn Task chưa DONE.`);
  signal('LATE_PROJECT', 'HIGH', projectOverdue ? 1 : 0, 'Project đã qua ngày kết thúc và còn Task chưa DONE.');
  signal('BLOCKED', 'MEDIUM', blockedCount, `${blockedCount} Task chưa DONE có dependency chưa DONE.`);
  signal('BEHIND_SPRINT', 'MEDIUM', behindSprintCount, `${behindSprintCount} Sprint ACTIVE có tỷ lệ DONE thấp hơn tỷ lệ thời gian đã qua.`);
  signal('MISSING_EFFORT', 'DATA', missingEffortCount, `${missingEffortCount} Task chưa DONE thiếu Effort.`);
  signal('MISSING_DEADLINE', 'DATA', missingDeadlineCount, `${missingDeadlineCount} Task chưa DONE thiếu hạn hoàn thành.`);
  signal('MISSING_CAPACITY', 'DATA', missingCapacityCount, `${missingCapacityCount} người phụ trách thiếu Capacity khớp đúng kỳ.`);
  signal('UNASSIGNED', 'DATA', unassignedCount, `${unassignedCount} Task chưa DONE chưa phân công.`);
  signal('UNAVAILABLE_ASSIGNEE', 'DATA', unavailableAssigneeCount, `${unavailableAssigneeCount} người phụ trách trong kỳ đã rời Project hoặc tài khoản khóa.`);
  signal('EMPTY_PROJECT', 'DATA', totalTaskCount === 0 ? 1 : 0, 'Project chưa có Task để đánh giá.');
  const incomplete = signals.some((item) => item.severity === 'DATA');
  const level = signals.some((item) => item.severity === 'HIGH') ? 'HIGH' : signals.some((item) => item.severity === 'MEDIUM') ? 'MEDIUM' : incomplete ? 'UNKNOWN' : 'LOW';
  return { level, confidence: incomplete ? 'INCOMPLETE' : 'COMPLETE', today, periodStart: period.periodStart, periodEnd: period.periodEnd,
    includesSprintCommitments: Boolean(commitments.sprintId || commitments.taskIds?.length), signals,
    metrics: { totalTaskCount, doneCount, activeCount, progressPercent: totalTaskCount ? Math.round(doneCount / totalTaskCount * 100) : 0, blockedCount, overdueCount, periodActiveTaskCount: groups.reduce((sum, group) => sum + group._count._all, 0), missingEffortCount, missingDeadlineCount, unassignedCount, missingCapacityCount, unavailableAssigneeCount, overloadedCount, lateActiveSprintCount, behindSprintCount, projectOverdue },
  };
}
