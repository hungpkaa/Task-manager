import { createHash } from 'node:crypto';
import type { Prisma, Sprint } from '../generated/prisma/client.js';

export async function sprintWorkload(tx: Prisma.TransactionClient, target: Sprint, selectedIds: string[] = []) {
  const selected = [...selectedIds].sort();
  // Backlog is already part of Project load. Read each Task once, including commitments
  // outside the dates so moving a Task into a Sprint cannot hide its effort.
  const tasks = await tx.task.findMany({ where: { projectId: target.projectId, OR: [
    { sprintId: target.id }, { id: { in: selected } },
    { status: { not: 'DONE' }, AND: [
      { OR: [{ startDate: null }, { startDate: { lte: target.endDate } }] },
      { OR: [{ dueDate: null }, { dueDate: { gte: target.startDate } }] },
    ] },
  ] }, orderBy: { id: 'asc' }, select: {
    id: true, title: true, status: true, priority: true, assigneeId: true, sprintId: true,
    startDate: true, dueDate: true, effort: true, updatedAt: true,
    assignee: { select: { id: true, displayName: true, status: true } },
    dependencies: { orderBy: { dependsOnTaskId: 'asc' }, select: { dependsOnTaskId: true, dependsOnTask: { select: { status: true, updatedAt: true } } } },
  } });
  const capacities = await tx.memberCapacity.findMany({ where: { projectId: target.projectId, periodStart: target.startDate, periodEnd: target.endDate }, orderBy: { userId: 'asc' } });
  const members = await tx.projectMember.findMany({ where: { projectId: target.projectId }, orderBy: { userId: 'asc' }, select: { userId: true, joinedAt: true } });
  const active = tasks.filter((task) => task.status !== 'DONE');
  const sprintTasks = active.filter((task) => task.sprintId === target.id || selected.includes(task.id));
  const assigneeIds = [...new Set(sprintTasks.flatMap((task) => task.assigneeId ? [task.assigneeId] : []))].sort();
  const rows = assigneeIds.map((userId) => {
    const own = sprintTasks.filter((task) => task.assigneeId === userId);
    const projectTasks = active.filter((task) => task.assigneeId === userId);
    const user = own[0]!.assignee!;
    const capacity = capacities.find((item) => item.userId === userId) ?? null;
    const sprintEffort = own.reduce((sum, task) => sum + (task.effort ?? 0), 0);
    const projectEffort = projectTasks.reduce((sum, task) => sum + (task.effort ?? 0), 0);
    return { user, currentMember: members.some((member) => member.userId === userId), capacityPoints: capacity?.capacityPoints ?? null,
      sprintTaskCount: own.length, sprintEffort, projectEffort,
      sprintMissingEffort: own.filter((task) => task.effort === null).length,
      projectMissingEffort: projectTasks.filter((task) => task.effort === null).length,
      sprintPercent: capacity ? Math.round(sprintEffort / capacity.capacityPoints * 10000) / 100 : null,
      projectPercent: capacity ? Math.round(projectEffort / capacity.capacityPoints * 10000) / 100 : null,
      sprintOverloaded: capacity !== null && sprintEffort > capacity.capacityPoints,
      projectOverloaded: capacity !== null && projectEffort > capacity.capacityPoints,
    };
  });
  const summary = { taskCount: sprintTasks.length, knownEffort: sprintTasks.reduce((sum, task) => sum + (task.effort ?? 0), 0),
    missingEffortCount: sprintTasks.filter((task) => task.effort === null).length,
    unassignedCount: sprintTasks.filter((task) => !task.assigneeId).length,
    missingCapacityCount: rows.filter((row) => row.capacityPoints === null).length,
    sprintOverloadedCount: rows.filter((row) => row.sprintOverloaded).length,
    projectOverloadedCount: rows.filter((row) => row.projectOverloaded).length,
  };
  const warnings: string[] = [];
  if (summary.missingCapacityCount) warnings.push(`Capacity/Workload: ${summary.missingCapacityCount} người phụ trách chưa có Capacity khớp kỳ Sprint.`);
  if (summary.sprintOverloadedCount) warnings.push(`Capacity/Workload: ${summary.sprintOverloadedCount} người phụ trách quá tải trong Sprint.`);
  if (summary.projectOverloadedCount) warnings.push(`Capacity/Workload: ${summary.projectOverloadedCount} người phụ trách quá tải tổng Project trong kỳ Sprint.`);
  if (summary.missingEffortCount) warnings.push(`Capacity/Workload: ${summary.missingEffortCount} Task chưa DONE trong Sprint chưa ước lượng Effort.`);
  if (rows.some((row) => row.projectMissingEffort)) warnings.push('Capacity/Workload: tổng tải Project của người tham gia Sprint còn Task thiếu Effort; tỷ lệ chỉ phản ánh phần đã biết.');
  if (summary.unassignedCount) warnings.push(`Capacity/Workload: ${summary.unassignedCount} Task chưa DONE trong Sprint chưa có người phụ trách.`);
  if (rows.some((row) => !row.currentMember || row.user.status !== 'ACTIVE')) warnings.push('Capacity/Workload: có người phụ trách không còn là thành viên hoặc tài khoản đang khóa.');
  warnings.push('Phân tích Risk chưa được tích hợp; PM cần xem cả dependency, deadline và tiến độ.');
  return { snapshot: createHash('sha256').update(JSON.stringify({ target, tasks, capacities, members, selected })).digest('hex'), warnings,
    workload: { periodStart: target.startDate.toISOString().slice(0, 10), periodEnd: target.endDate.toISOString().slice(0, 10), summary, rows },
    capacityAvailable: summary.missingCapacityCount === 0 && summary.unassignedCount === 0,
  };
}
