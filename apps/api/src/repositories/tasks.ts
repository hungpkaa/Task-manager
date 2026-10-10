import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';
import { mentionEmails } from '../services/comment-validation.js';
import { taskStatuses, type CreateTaskInput, type UpdateTaskInput, type TaskQuery, type StatusTaskInput } from '../services/task-validation.js';

type Client = PrismaClient | Prisma.TransactionClient;
const userSelect = { id: true, displayName: true, email: true } as const;
const include = { assignee: { select: userSelect }, project: { select: { id: true, name: true, workspaceId: true, managerUserId: true, status: true } }, dependencies: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } } } as const;
async function access(client: Client, projectId: string, actorId: string) {
  const project = await client.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, 'Project không tồn tại.');
  const workspaceMember = await client.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actorId } } });
  const projectMember = await client.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } });
  if (!workspaceMember || (workspaceMember.role !== 'OWNER' && !projectMember)) throw new HttpError(403, 'Bạn không có quyền xem công việc trong Project này.');
  return { project, projectMember };
}
function view(task: Prisma.TaskGetPayload<{ include: typeof include }>, actorId: string, isMember = true) {
  const { dependencies, ...data } = task;
  const blockingTasks = dependencies.map((dependency) => dependency.dependsOnTask).filter((dependency) => dependency.status !== 'DONE');
  const canEdit = task.project.status === 'ACTIVE' && task.project.managerUserId === actorId;
  return { ...data, blockingTasks, blocked: blockingTasks.length > 0, canEdit,
    canChangeStatus: task.project.status === 'ACTIVE' && (canEdit || isMember && task.assigneeId === actorId) };
}
function dateData(input: UpdateTaskInput) {
  return { ...input,
    ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null } : {}),
  };
}
function whereQuery(query: TaskQuery): Prisma.TaskWhereInput {
  return { ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }] } : {}),
    ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId === 'unassigned' ? null : query.assigneeId } : {}) };
}
export function createTaskRepository(client: PrismaClient) {
  async function result(tx: Client, id: string, actorId: string) { return view(await tx.task.findUniqueOrThrow({ where: { id }, include }), actorId); }
  async function assignee(tx: Client, projectId: string, assigneeId: string | null) {
    if (!assigneeId) return;
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: assigneeId } }, include: { workspaceMember: { include: { user: { select: { status: true } } } } } });
    if (!member) throw new HttpError(400, 'Người phụ trách phải thuộc Project.', { assigneeId: 'Chọn thành viên Project.' });
    if (member.workspaceMember.user.status !== 'ACTIVE') throw new HttpError(409, 'Người phụ trách đang bị khóa.');
  }
  async function notify(tx: Prisma.TransactionClient, userId: string, taskId: string, title: string) {
    await tx.notification.create({ data: { userId, type: 'TASK_ASSIGNED', title: 'Bạn được giao công việc', message: `Bạn được phân công công việc “${title}”.`, relatedEntityType: 'TASK', relatedEntityId: taskId } });
  }
  async function mutate<T>(projectId: string, actorId: string, managerOnly: boolean, operation: (tx: Prisma.TransactionClient, project: Awaited<ReturnType<typeof access>>['project']) => Promise<T>) {
    return client.$transaction(async (tx) => {
      const located = await tx.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
      if (!located) throw new HttpError(404, 'Project không tồn tại.');
      await tx.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${located.workspaceId}::uuid FOR UPDATE`;
      const { project } = await access(tx, projectId, actorId);
      if (managerOnly && project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ PM hiện tại được quản lý Task.');
      if (project.status !== 'ACTIVE') throw new HttpError(409, 'Project đã đóng; không thể thay đổi Task.');
      return operation(tx, project);
    });
  }
  async function taskProject(id: string) {
    const task = await client.task.findUnique({ where: { id }, select: { projectId: true } });
    if (!task) throw new HttpError(404, 'Task không tồn tại.');
    return task.projectId;
  }
  async function taskMutation<T>(id: string, actorId: string, managerOnly: boolean, operation: (tx: Prisma.TransactionClient, task: Prisma.TaskGetPayload<{}>, project: Awaited<ReturnType<typeof access>>['project']) => Promise<T>) {
    return mutate(await taskProject(id), actorId, managerOnly, async (tx, project) => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task) throw new HttpError(404, 'Task không tồn tại.');
      return operation(tx, task, project);
    });
  }
  async function list(where: Prisma.TaskWhereInput, actorId: string, query: TaskQuery) {
    const orderBy: Prisma.TaskOrderByWithRelationInput = query.sort === 'dueDate' ? { dueDate: { sort: query.direction, nulls: 'last' } } : { [query.sort]: query.direction };
    const { items, total } = await client.$transaction(async (tx) => {
      const items = await tx.task.findMany({ where, include, orderBy: [orderBy, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      const total = await tx.task.count({ where });
      return { items, total };
    }, { isolationLevel: 'RepeatableRead' });
    return { tasks: items.map((task) => view(task, actorId)), total, page: query.page, pageSize: query.pageSize };
  }
  return {
    async comments(id: string, actorId: string, page: number) {
      const { project, projectMember } = await access(client, await taskProject(id), actorId);
      return client.$transaction(async (tx) => {
        const items = await tx.comment.findMany({ where: { taskId: id }, include: { author: { select: userSelect }, mentions: { include: { user: { select: userSelect } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 });
        const total = await tx.comment.count({ where: { taskId: id } });
        return { items, total, page, pageSize: 20, canPost: project.status === 'ACTIVE' && Boolean(projectMember) };
      }, { isolationLevel: 'RepeatableRead' });
    },
    addComment: (id: string, actorId: string, body: string) => taskMutation(id, actorId, false, async (tx, task, project) => {
      if (!await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: actorId } } })) throw new HttpError(403, 'Chỉ thành viên Project được bình luận.');
      const emails = mentionEmails(body);
      if (emails.length > 20) throw new HttpError(400, 'Mỗi bình luận mention tối đa 20 người.');
      const members = await tx.projectMember.findMany({ where: { projectId: project.id, workspaceMember: { user: { email: { in: emails }, status: 'ACTIVE' } } }, include: { workspaceMember: { include: { user: { select: userSelect } } } } });
      if (members.length !== emails.length) throw new HttpError(400, 'Người được mention phải là thành viên đang hoạt động trong Project.');
      const comment = await tx.comment.create({ data: { taskId: id, authorId: actorId, body, mentions: { create: members.map((member) => ({ userId: member.userId })) } }, include: { author: { select: userSelect }, mentions: { include: { user: { select: userSelect } } } } });
      for (const member of members) {
        if (member.userId === actorId) continue;
        await tx.notification.create({ data: { userId: member.userId, type: 'COMMENT_MENTION', title: 'Bạn được nhắc trong bình luận', message: `${comment.author.displayName} nhắc bạn trong công việc “${task.title}”.`, relatedEntityType: 'TASK', relatedEntityId: id } });
      }
      return comment;
    }),
    async list(projectId: string, actorId: string, query: TaskQuery) { await access(client, projectId, actorId); return list({ ...whereQuery(query), projectId }, actorId, query); },
    myTasks: (actorId: string, query: TaskQuery) => list({ ...whereQuery(query), assigneeId: actorId, project: { members: { some: { userId: actorId, workspaceMember: { userId: actorId } } } } }, actorId, query),
    async detail(id: string, actorId: string) {
      const { projectMember } = await access(client, await taskProject(id), actorId);
      const task = await client.task.findUnique({ where: { id }, include });
      if (!task) throw new HttpError(404, 'Task không tồn tại.');
      return view(task, actorId, Boolean(projectMember));
    },
    create: (projectId: string, actorId: string, input: CreateTaskInput) => mutate(projectId, actorId, true, async (tx) => {
      await assignee(tx, projectId, input.assigneeId);
      const task = await tx.task.create({ data: { ...dateData(input), title: input.title, projectId, assigneeId: input.assigneeId } });
      if (task.assigneeId) await notify(tx, task.assigneeId, task.id, task.title);
      return result(tx, task.id, actorId);
    }),
    update: (id: string, actorId: string, input: UpdateTaskInput) => taskMutation(id, actorId, true, async (tx, task) => {
      const start = input.startDate === undefined ? task.startDate : input.startDate ? new Date(input.startDate) : null;
      const due = input.dueDate === undefined ? task.dueDate : input.dueDate ? new Date(input.dueDate) : null;
      if (start && due && due < start) throw new HttpError(400, 'Deadline không được trước ngày bắt đầu.', { dueDate: 'Kiểm tra khoảng thời gian công việc.' });
      await tx.task.update({ where: { id }, data: dateData(input) }); return result(tx, id, actorId);
    }),
    assign: (id: string, actorId: string, assigneeId: string | null) => taskMutation(id, actorId, true, async (tx, task) => {
      await assignee(tx, task.projectId, assigneeId);
      if (task.assigneeId !== assigneeId) {
        await tx.task.update({ where: { id }, data: { assigneeId } });
        if (assigneeId) await notify(tx, assigneeId, id, task.title);
      }
      return result(tx, id, actorId);
    }),
    status: (id: string, actorId: string, input: StatusTaskInput) => taskMutation(id, actorId, false, async (tx, task, project) => {
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: actorId } } });
      if (project.managerUserId !== actorId && (!member || task.assigneeId !== actorId)) throw new HttpError(403, 'Chỉ PM hoặc người được giao Task được cập nhật trạng thái.');
      if (task.status !== input.expectedStatus) throw new HttpError(409, 'Trạng thái đã thay đổi. Tải lại Task trước khi cập nhật.');
      if (input.status !== task.status && taskStatuses.indexOf(input.status) !== taskStatuses.indexOf(task.status) + 1) throw new HttpError(409, 'Chuyển lần lượt TODO → IN_PROGRESS → REVIEW → DONE.');
      const current = await result(tx, id, actorId);
      if (input.status !== task.status && current.blocked && !input.acknowledgeBlocked) throw new HttpError(409, 'Task đang BLOCKED vì còn dependency chưa DONE. Xem cảnh báo và xác nhận trước khi tiếp tục.');
      if (input.status !== task.status) await tx.task.update({ where: { id }, data: { status: input.status } });
      return { task: await result(tx, id, actorId), warning: current.blocked ? 'Task còn dependency chưa hoàn thành.' : null };
    }),
    remove: (id: string, actorId: string) => taskMutation(id, actorId, true, async (tx) => {
      if (await tx.taskDependency.count({ where: { dependsOnTaskId: id } })) throw new HttpError(409, 'Task đang được công việc khác phụ thuộc. Gỡ dependency trước khi xóa.');
      await tx.task.delete({ where: { id } });
    }),
  };
}
export type TaskRepository = ReturnType<typeof createTaskRepository>;
