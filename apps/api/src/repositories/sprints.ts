import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { createHash } from 'node:crypto';
import { HttpError } from '../domain/errors.js';
import type { FinishInput, RetrospectiveInput, ReviewInput, DailyInput, PlanningInput, SprintInput, MonitorQuery } from '../services/sprint-validation.js';
import { sprintWorkload } from './sprint-workload.js';
type Client = PrismaClient | Prisma.TransactionClient;
async function access(client: Client, projectId: string, actorId: string, write = false) {
  const project = await client.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, 'Project không tồn tại.');
  const member = await client.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actorId } } });
  const projectMember = await client.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } });
  if (!member || (member.role !== 'OWNER' && !projectMember)) throw new HttpError(403, 'Bạn không có quyền xem Sprint trong Project này.');
  if (write && project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ PM hiện tại được lập kế hoạch Sprint.');
  if (write && project.status !== 'ACTIVE') throw new HttpError(409, 'Project đã đóng; không thể thay đổi Sprint.');
  return project;
}
export function createSprintRepository(client: PrismaClient) {
  async function mutate<T>(projectId: string, actorId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return client.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
      if (!project) throw new HttpError(404, 'Project không tồn tại.');
      await tx.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${project.workspaceId}::uuid FOR UPDATE`;
      await access(tx, projectId, actorId, true);
      return operation(tx);
    });
  }
  async function sprint(tx: Client, projectId: string, id: string) {
    const result = await tx.sprint.findFirst({ where: { id, projectId } });
    if (!result) throw new HttpError(404, 'Sprint không thuộc Project này.');
    return result;
  }
  async function dailyAccess(tx: Client, projectId: string, actorId: string, id: string) {
    const project = await access(tx, projectId, actorId);
    if (!await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } })) throw new HttpError(403, 'Chỉ thành viên Project được dùng Daily Update.');
    return { project, target: await sprint(tx, projectId, id) };
  }
  return {
    finishPreview: (projectId: string, actorId: string, id: string) => mutate(projectId, actorId, async (tx) => {
      const target = await sprint(tx, projectId, id);
      if (target.status !== 'ACTIVE') throw new HttpError(409, 'Chỉ Sprint ACTIVE được kết thúc.');
      const tasks = await tx.task.findMany({ where: { projectId, sprintId: id }, orderBy: { id: 'asc' }, select: { id: true, title: true, status: true, updatedAt: true } });
      const snapshot = createHash('sha256').update(JSON.stringify({ target, tasks })).digest('hex');
      return { snapshot, doneCount: tasks.filter((task) => task.status === 'DONE').length, incompleteCount: tasks.filter((task) => task.status !== 'DONE').length };
    }),
    finish: (projectId: string, actorId: string, id: string, input: FinishInput) => mutate(projectId, actorId, async (tx) => {
      const target = await sprint(tx, projectId, id);
      if (target.status !== 'ACTIVE') throw new HttpError(409, 'Chỉ Sprint ACTIVE được kết thúc.');
      const tasks = await tx.task.findMany({ where: { projectId, sprintId: id }, orderBy: { id: 'asc' }, select: { id: true, title: true, status: true, updatedAt: true } });
      const snapshot = createHash('sha256').update(JSON.stringify({ target, tasks })).digest('hex');
      if (snapshot !== input.expectedSnapshot) throw new HttpError(409, 'Sprint hoặc Task đã thay đổi. Hãy kiểm tra kết thúc lại.');
      const incomplete = tasks.filter((task) => task.status !== 'DONE');
      if (input.destinationSprintId) {
        const destination = await sprint(tx, projectId, input.destinationSprintId);
        if (destination.id === id || destination.status !== 'PLANNED') throw new HttpError(409, 'Sprint nhận Task phải là Sprint PLANNED khác trong cùng Project.');
      }
      if (!input.confirmed) return { applied: false };
      await tx.task.updateMany({ where: { id: { in: incomplete.map((task) => task.id) } }, data: { sprintId: input.destinationSprintId } });
      const completion = { actorId, destinationSprintId: input.destinationSprintId, doneCount: tasks.length - incomplete.length, incompleteCount: incomplete.length, tasks: tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, destinationSprintId: task.status === 'DONE' ? id : input.destinationSprintId })) };
      await tx.sprint.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), completion } });
      const members = await tx.projectMember.findMany({ where: { projectId } });
      await tx.notification.createMany({ data: members.map((member) => ({ userId: member.userId, type: 'SPRINT_COMPLETED', title: 'Sprint đã hoàn thành', message: `Sprint “${target.name}” đã kết thúc: ${completion.doneCount} Task DONE, ${completion.incompleteCount} Task chuyển tiếp.`, relatedEntityType: 'PROJECT', relatedEntityId: projectId })) });
      return { applied: true };
    }),
    async retrospective(projectId: string, actorId: string, id: string) {
      return client.$transaction(async (tx) => {
        const { project, target } = await dailyAccess(tx, projectId, actorId, id);
        return { retrospective: await tx.sprintRetrospective.findUnique({ where: { sprintId: id }, include: { author: { select: { id: true, displayName: true } } } }), canEdit: project.status === 'ACTIVE' && target.status !== 'COMPLETED' };
      }, { isolationLevel: 'RepeatableRead' });
    },
    async saveRetrospective(projectId: string, actorId: string, id: string, input: RetrospectiveInput) {
      return client.$transaction(async (tx) => {
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project) throw new HttpError(404, 'Project không tồn tại.');
        await tx.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${project.workspaceId}::uuid FOR UPDATE`;
        const context = await dailyAccess(tx, projectId, actorId, id);
        if (context.project.status !== 'ACTIVE' || context.target.status === 'COMPLETED') throw new HttpError(409, 'Project đã đóng hoặc Sprint đã hoàn thành; Retrospective chỉ được xem.');
        const existing = await tx.sprintRetrospective.findUnique({ where: { sprintId: id } });
        if ((existing?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) throw new HttpError(409, 'Retrospective đã thay đổi. Hãy tải lại trước khi lưu.');
        const data = { wentWell: input.wentWell, needsImprovement: input.needsImprovement, actionItems: input.actionItems, authorId: actorId };
        return tx.sprintRetrospective.upsert({ where: { sprintId: id }, create: { sprintId: id, ...data }, update: { ...data, updatedAt: new Date(Math.max(Date.now(), (existing?.updatedAt.getTime() ?? 0) + 1)) }, include: { author: { select: { id: true, displayName: true } } } });
      });
    },
    async review(projectId: string, actorId: string, id: string) {
      return client.$transaction(async (tx) => {
        const { project, target } = await dailyAccess(tx, projectId, actorId, id);
        const where = { projectId, sprintId: id };
        return {
          review: await tx.sprintReview.findUnique({ where: { sprintId: id }, include: { author: { select: { id: true, displayName: true } } } }),
          current: { doneCount: await tx.task.count({ where: { ...where, status: 'DONE' } }), incompleteCount: await tx.task.count({ where: { ...where, status: { not: 'DONE' } } }) },
          canEdit: project.managerUserId === actorId && project.status === 'ACTIVE' && target.status !== 'COMPLETED',
        };
      }, { isolationLevel: 'RepeatableRead' });
    },
    saveReview: (projectId: string, actorId: string, id: string, input: ReviewInput) => mutate(projectId, actorId, async (tx) => {
      const target = await sprint(tx, projectId, id);
      if (target.status === 'COMPLETED') throw new HttpError(409, 'Sprint đã hoàn thành; Review chỉ được xem.');
      const existing = await tx.sprintReview.findUnique({ where: { sprintId: id } });
      if ((existing?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) throw new HttpError(409, 'Review đã thay đổi. Hãy tải lại trước khi lưu.');
      const where = { projectId, sprintId: id };
      const data = { summary: input.summary, feedback: input.feedback, authorId: actorId,
        doneCount: await tx.task.count({ where: { ...where, status: 'DONE' } }),
        incompleteCount: await tx.task.count({ where: { ...where, status: { not: 'DONE' } } }),
      };
      return tx.sprintReview.upsert({ where: { sprintId: id }, create: { sprintId: id, ...data }, update: { ...data, updatedAt: new Date(Math.max(Date.now(), (existing?.updatedAt.getTime() ?? 0) + 1)) }, include: { author: { select: { id: true, displayName: true } } } });
    }),
    async daily(projectId: string, actorId: string, id: string, page: number) {
      return client.$transaction(async (tx) => {
        const { target, project } = await dailyAccess(tx, projectId, actorId, id);
        const where = { sprintId: id };
        return { items: await tx.dailyUpdate.findMany({ where, include: { author: { select: { id: true, displayName: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }), total: await tx.dailyUpdate.count({ where }), page, pageSize: 20, canCreate: target.status === 'ACTIVE' && project.status === 'ACTIVE' };
      }, { isolationLevel: 'RepeatableRead' });
    },
    async addDaily(projectId: string, actorId: string, id: string, input: DailyInput) {
      return client.$transaction(async (tx) => {
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project) throw new HttpError(404, 'Project không tồn tại.');
        await tx.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${project.workspaceId}::uuid FOR UPDATE`;
        const context = await dailyAccess(tx, projectId, actorId, id);
        if (context.project.status !== 'ACTIVE' || context.target.status !== 'ACTIVE') throw new HttpError(409, 'Daily Update chỉ được gửi trong Project và Sprint ACTIVE.');
        return tx.dailyUpdate.create({ data: { sprintId: id, authorId: actorId, ...input } });
      });
    },
    async list(projectId: string, actorId: string, page: number) {
      await access(client, projectId, actorId);
      return client.$transaction(async (tx) => ({ items: await tx.sprint.findMany({ where: { projectId }, include: { _count: { select: { tasks: true } } }, orderBy: [{ startDate: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), total: await tx.sprint.count({ where: { projectId } }), page, pageSize: 20, canMonitor: Boolean(await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } })) }), { isolationLevel: 'RepeatableRead' });
    },
    start: (projectId: string, actorId: string, id: string, expectedUpdatedAt: string, confirmed: boolean, expectedSnapshot?: string) => mutate(projectId, actorId, async (tx) => {
      const target = await sprint(tx, projectId, id);
      if (target.status !== 'PLANNED' || target.updatedAt.toISOString() !== expectedUpdatedAt) throw new HttpError(409, 'Sprint đã thay đổi hoặc không còn PLANNED. Hãy tải lại Sprint.');
      if (!target.goal.trim()) throw new HttpError(409, 'Sprint phải có Goal trước khi bắt đầu.');
      if (await tx.sprint.count({ where: { projectId, status: 'ACTIVE' } })) throw new HttpError(409, 'Project đã có Sprint ACTIVE. Kết thúc Sprint đó trước khi bắt đầu Sprint khác.');
      const count = await tx.task.count({ where: { projectId, sprintId: id } });
      if (!count) throw new HttpError(409, 'Sprint Backlog phải có ít nhất một Task trước khi bắt đầu.');
      const blocked = await tx.task.count({ where: { projectId, sprintId: id, status: { not: 'DONE' }, dependencies: { some: { dependsOnTask: { status: { not: 'DONE' } } } } } });
      const missingEffort = await tx.task.count({ where: { projectId, sprintId: id, effort: null } });
      const coordination = await sprintWorkload(tx, target);
      const warnings = [...coordination.warnings];
      if (blocked) warnings.push(`${blocked} Task có dependency chưa DONE.`);
      if (missingEffort) warnings.push(`${missingEffort} Task chưa ước lượng Effort.`);
      const assessment = { taskCount: count, warnings, snapshot: coordination.snapshot, workload: coordination.workload };
      if (!confirmed) return { ...assessment, applied: false, sprint: target };
      if (expectedSnapshot !== coordination.snapshot) throw new HttpError(409, 'Dữ liệu Sprint/Task/Capacity đã thay đổi hoặc thiếu bản kiểm tra. Hãy kiểm tra bắt đầu Sprint lại.');
      const updated = await tx.sprint.update({ where: { id }, data: { status: 'ACTIVE', startedAt: new Date() } });
      const members = await tx.projectMember.findMany({ where: { projectId } });
      for (const member of members) await tx.notification.create({ data: { userId: member.userId, type: 'SPRINT_STARTED', title: 'Sprint đã bắt đầu', message: `Sprint “${target.name}” đã bắt đầu. Mở Project để theo dõi Sprint.`, relatedEntityType: 'PROJECT', relatedEntityId: projectId } });
      return { ...assessment, applied: true, sprint: updated };
    }),
    async monitor(projectId: string, actorId: string, id: string, query: MonitorQuery, now = new Date()) {
      return client.$transaction(async (tx) => {
        const project = await access(tx, projectId, actorId);
        if (!await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } })) throw new HttpError(403, 'Chỉ thành viên Project được theo dõi Sprint.');
        const target = await sprint(tx, projectId, id);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        const todayDate = new Date(`${today}T00:00:00Z`);
        const base = { projectId, sprintId: id };
        const where: Prisma.TaskWhereInput = { ...base, ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}), ...(query.assigneeId ? { assigneeId: query.assigneeId === 'unassigned' ? null : query.assigneeId } : {}) };
        const groups = await tx.task.groupBy({ by: ['status'], where: base, _count: { _all: true } });
        const counts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
        for (const group of groups) counts[group.status] = group._count._all;
        const all = Object.values(counts).reduce((sum, count) => sum + count, 0);
        const blocked = await tx.task.count({ where: { ...base, status: { not: 'DONE' }, dependencies: { some: { dependsOnTask: { status: { not: 'DONE' } } } } } });
        const overdue = await tx.task.count({ where: { ...base, status: { not: 'DONE' }, dueDate: { lt: todayDate } } });
        const records = await tx.task.findMany({ where, include: { assignee: { select: { id: true, displayName: true } }, dependencies: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } } }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * 20, take: 20 });
        const items = records.map(({ dependencies, ...task }) => {
          const blockingTasks = dependencies.map((item) => item.dependsOnTask).filter((item) => item.status !== 'DONE');
          return { ...task, blockingTasks, blocked: task.status !== 'DONE' && blockingTasks.length > 0, overdue: task.status !== 'DONE' && Boolean(task.dueDate && task.dueDate < todayDate) };
        });
        const assignees = await tx.task.findMany({ where: { ...base, assigneeId: { not: null } }, distinct: ['assigneeId'], select: { assignee: { select: { id: true, displayName: true } } } });
        const coordination = project.managerUserId === actorId ? await sprintWorkload(tx, target) : null;
        return { sprint: target, summary: { total: all, counts, progressPercent: all ? Math.round(counts.DONE / all * 100) : 0, blocked, overdue, daysRemaining: Math.max(0, Math.round((target.endDate.getTime() - todayDate.getTime()) / 86400000)), today, sprintOverdue: target.status === 'ACTIVE' && target.endDate < todayDate }, items, total: await tx.task.count({ where }), page: query.page, pageSize: 20, assignees: assignees.flatMap((item) => item.assignee ? [item.assignee] : []), workload: coordination?.workload ?? null, warnings: coordination?.warnings ?? ['Capacity/Workload tổng Project chỉ dành cho PM. Phân tích Risk chưa được tích hợp.'] };
      }, { isolationLevel: 'RepeatableRead' });
    },
    async backlog(projectId: string, actorId: string, page: number, sprintId?: string) {
      await access(client, projectId, actorId);
      if (sprintId) await sprint(client, projectId, sprintId);
      const where = { projectId, sprintId: sprintId ?? null };
      return client.$transaction(async (tx) => ({ items: await tx.task.findMany({ where, include: { assignee: { select: { displayName: true } } }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), total: await tx.task.count({ where }), page, pageSize: 20 }), { isolationLevel: 'RepeatableRead' });
    },
    create: (projectId: string, actorId: string, input: SprintInput) => mutate(projectId, actorId, (tx) => tx.sprint.create({ data: { projectId, name: input.name, goal: input.goal, startDate: new Date(`${input.startDate}T00:00:00Z`), endDate: new Date(`${input.endDate}T00:00:00Z`) } })),
    plan: (projectId: string, actorId: string, id: string, input: PlanningInput) => mutate(projectId, actorId, async (tx) => {
      const target = await sprint(tx, projectId, id);
      if (target.status === 'COMPLETED') throw new HttpError(409, 'Sprint đã hoàn thành; không thể lập kế hoạch.');
      const tasks = await tx.task.findMany({ where: { projectId, id: { in: input.tasks.map((task) => task.id) } }, include: { dependencies: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } } } });
      if (tasks.length !== input.tasks.length) throw new HttpError(400, 'Mọi Task được chọn phải thuộc Project này.');
      if (tasks.some((task) => task.sprintId !== null || task.updatedAt.toISOString() !== input.tasks.find((item) => item.id === task.id)!.updatedAt)) throw new HttpError(409, 'Task đã thay đổi hoặc đã thuộc Sprint. Hãy tải lại Backlog và kiểm tra lại.');
      const coordination = await sprintWorkload(tx, target, tasks.map((task) => task.id));
      const warnings = [...coordination.warnings];
      for (const task of tasks) {
        if (task.effort === null) warnings.push(`“${task.title}”: chưa ước lượng Effort.`);
        if (!task.assigneeId) warnings.push(`“${task.title}”: chưa có người phụ trách.`);
        const blocked = task.dependencies.filter((dependency) => dependency.dependsOnTask.status !== 'DONE');
        if (blocked.length) warnings.push(`“${task.title}”: phụ thuộc chưa DONE: ${blocked.map((dependency) => dependency.dependsOnTask.title).join(', ')}.`);
        if (task.dueDate && task.dueDate > target.endDate) warnings.push(`“${task.title}”: hạn hoàn thành sau ngày kết thúc Sprint.`);
        if (task.startDate && task.startDate > target.endDate) warnings.push(`“${task.title}”: ngày bắt đầu sau ngày kết thúc Sprint.`);
        if (task.status === 'DONE') warnings.push(`“${task.title}”: Task đã DONE.`);
      }
      const assessment = { warnings, totalEffort: tasks.reduce((sum, task) => sum + (task.effort ?? 0), 0), missingEffort: tasks.filter((task) => task.effort === null).length, taskCount: tasks.length, capacityAvailable: coordination.capacityAvailable, snapshot: coordination.snapshot, workload: coordination.workload };
      if (!input.confirmed) return { ...assessment, applied: false };
      if (input.expectedSnapshot !== coordination.snapshot) throw new HttpError(409, 'Dữ liệu Sprint/Task/Capacity đã thay đổi hoặc thiếu bản kiểm tra. Hãy kiểm tra kế hoạch lại.');
      await tx.task.updateMany({ where: { projectId, id: { in: tasks.map((task) => task.id) } }, data: { sprintId: id } });
      return { ...assessment, applied: true };
    }),
    returnTask: (projectId: string, actorId: string, id: string, taskId: string, updatedAt: string) => mutate(projectId, actorId, async (tx) => {
      const target = await sprint(tx, projectId, id);
      if (target.status !== 'PLANNED') throw new HttpError(409, 'Chỉ có thể đưa Task về Product Backlog trước khi Sprint bắt đầu.');
      const task = await tx.task.findFirst({ where: { id: taskId, projectId, sprintId: id } });
      if (!task || task.updatedAt.toISOString() !== updatedAt) throw new HttpError(409, 'Task đã thay đổi. Hãy tải lại Backlog.');
      await tx.task.update({ where: { id: taskId }, data: { sprintId: null } });
    }),
  };
}
export type SprintRepository = ReturnType<typeof createSprintRepository>;
