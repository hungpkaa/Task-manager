import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';
import type { PlanningInput, SprintInput } from '../services/sprint-validation.js';
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
  return {
    async list(projectId: string, actorId: string, page: number) {
      await access(client, projectId, actorId);
      return client.$transaction(async (tx) => ({ items: await tx.sprint.findMany({ where: { projectId }, include: { _count: { select: { tasks: true } } }, orderBy: [{ startDate: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), total: await tx.sprint.count({ where: { projectId } }), page, pageSize: 20 }), { isolationLevel: 'RepeatableRead' });
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
      const warnings = ['Chưa có dữ liệu Capacity/Workload để kết luận quá tải. PM cần kiểm tra năng lực của nhóm trước khi xác nhận.'];
      for (const task of tasks) {
        if (task.effort === null) warnings.push(`“${task.title}”: chưa ước lượng Effort.`);
        if (!task.assigneeId) warnings.push(`“${task.title}”: chưa có người phụ trách.`);
        const blocked = task.dependencies.filter((dependency) => dependency.dependsOnTask.status !== 'DONE');
        if (blocked.length) warnings.push(`“${task.title}”: phụ thuộc chưa DONE: ${blocked.map((dependency) => dependency.dependsOnTask.title).join(', ')}.`);
        if (task.dueDate && task.dueDate > target.endDate) warnings.push(`“${task.title}”: hạn hoàn thành sau ngày kết thúc Sprint.`);
        if (task.status === 'DONE') warnings.push(`“${task.title}”: Task đã DONE.`);
      }
      const assessment = { warnings, totalEffort: tasks.reduce((sum, task) => sum + (task.effort ?? 0), 0), missingEffort: tasks.filter((task) => task.effort === null).length, taskCount: tasks.length, capacityAvailable: false };
      if (!input.confirmed) return { ...assessment, applied: false };
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
