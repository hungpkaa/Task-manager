import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';
import { mentionEmails } from '../services/comment-validation.js';
import { taskStatuses, type CreateTaskInput, type UpdateTaskInput, type TaskQuery, type StatusTaskInput } from '../services/task-validation.js';

type Client = PrismaClient | Prisma.TransactionClient;
const userSelect = { id: true, displayName: true, email: true } as const;
const attachmentSelect = { id: true, taskId: true, uploadedBy: true, filename: true, sizeBytes: true, createdAt: true, uploader: { select: userSelect } } as const;
const include = { assignee: { select: userSelect }, assignees: { include: { user: { select: userSelect } }, orderBy: { assignedAt: 'asc' } }, project: { select: { id: true, name: true, workspaceId: true, managerUserId: true, status: true, startDate: true, endDate: true } }, dependencies: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } } } as const;
async function access(client: Client, projectId: string, actorId: string) {
  const project = await client.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, 'Project không tồn tại.');
  const workspaceMember = await client.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actorId } } });
  const projectMember = await client.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } });
  if (!workspaceMember || (workspaceMember.role !== 'OWNER' && !projectMember)) throw new HttpError(403, 'Bạn không có quyền xem công việc trong Project này.');
  return { project, projectMember };
}
function view(task: Prisma.TaskGetPayload<{ include: typeof include }>, actorId: string, isMember = true) {
  const { dependencies, assignees, ...data } = task;
  const blockingTasks = dependencies.map((dependency) => dependency.dependsOnTask).filter((dependency) => dependency.status !== 'DONE');
  const canEdit = task.project.status === 'ACTIVE' && task.project.managerUserId === actorId;
  const assignedUsers = assignees.map((item) => item.user);
  const isAssigned = (data.assigneeId ? data.assigneeId === actorId : false) || assignedUsers.some((u) => u.id === actorId);
  return { ...data, assignees: assignedUsers, assigneeIds: assignedUsers.map((u) => u.id), blockingTasks, blocked: blockingTasks.length > 0, canEdit,
    canChangeStatus: task.project.status === 'ACTIVE' && (canEdit || isMember && isAssigned) };
}
function validateTaskDates(start: Date | null, due: Date | null, project: { startDate: Date | null; endDate: Date | null }) {
  if (start && due && due < start) throw new HttpError(400, 'Deadline không được trước ngày bắt đầu.', { dueDate: 'Kiểm tra khoảng thời gian công việc.' });
  if (project.startDate) {
    if (start && start < project.startDate) throw new HttpError(400, `Ngày bắt đầu công việc không được trước ngày bắt đầu của Project (${project.startDate.toISOString().slice(0, 10)}).`, { startDate: 'Thời gian công việc phải nằm trong thời gian của Project.' });
    if (due && due < project.startDate) throw new HttpError(400, `Deadline không được trước ngày bắt đầu của Project (${project.startDate.toISOString().slice(0, 10)}).`, { dueDate: 'Thời gian công việc phải nằm trong thời gian của Project.' });
  }
  if (project.endDate) {
    if (start && start > project.endDate) throw new HttpError(400, `Ngày bắt đầu công việc không được sau ngày kết thúc của Project (${project.endDate.toISOString().slice(0, 10)}).`, { startDate: 'Thời gian công việc phải nằm trong thời gian của Project.' });
    if (due && due > project.endDate) throw new HttpError(400, `Deadline không được sau ngày kết thúc của Project (${project.endDate.toISOString().slice(0, 10)}).`, { dueDate: 'Thời gian công việc phải nằm trong thời gian của Project.' });
  }
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
    ...(query.assigneeId
      ? query.assigneeId === 'unassigned'
        ? { assigneeId: null, assignees: { none: {} } }
        : { OR: [{ assigneeId: query.assigneeId }, { assignees: { some: { userId: query.assigneeId } } }] }
      : {}) };
}
export function createTaskRepository(client: PrismaClient) {
  async function result(tx: Client, id: string, actorId: string) { return view(await tx.task.findUniqueOrThrow({ where: { id }, include }), actorId); }
  async function validateAssignees(tx: Client, projectId: string, userIds: string[]) {
    if (!userIds.length) return;
    const members = await tx.projectMember.findMany({ where: { projectId, userId: { in: userIds } }, include: { workspaceMember: { include: { user: { select: { status: true } } } } } });
    if (members.length !== userIds.length) throw new HttpError(400, 'Tất cả người phụ trách phải thuộc Project.', { assigneeId: 'Chọn thành viên Project.' });
    for (const member of members) {
      if (member.workspaceMember.user.status !== 'ACTIVE') throw new HttpError(409, 'Người phụ trách đang bị khóa.');
    }
  }
  function toAssigneeIds(input: string | null | string[] | undefined): string[] {
    if (Array.isArray(input)) return [...new Set(input.filter(Boolean))];
    if (typeof input === 'string' && input) return [input];
    return [];
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
    async dependencies(id: string, actorId: string, page: number) {
      return client.$transaction(async (tx) => {
        const task = await tx.task.findUnique({ where: { id } });
        if (!task) throw new HttpError(404, 'Task không tồn tại.');
        const { project } = await access(tx, task.projectId, actorId);
        return { items: await tx.taskDependency.findMany({ where: { taskId: id }, include: { dependsOnTask: { select: { id: true, title: true, status: true } } }, orderBy: { dependsOnTaskId: 'asc' }, skip: (page - 1) * 20, take: 20 }), total: await tx.taskDependency.count({ where: { taskId: id } }), page, pageSize: 20, canEdit: project.status === 'ACTIVE' && project.managerUserId === actorId };
      }, { isolationLevel: 'RepeatableRead' });
    },
    addDependency: (id: string, actorId: string, dependsOnTaskId: string) => taskMutation(id, actorId, true, async (tx, task) => {
      if (id === dependsOnTaskId) throw new HttpError(400, 'Task không được phụ thuộc chính nó.');
      const dependency = await tx.task.findFirst({ where: { id: dependsOnTaskId, projectId: task.projectId } });
      if (!dependency) throw new HttpError(400, 'Task phụ thuộc phải thuộc cùng Project.');
      if (await tx.taskDependency.findUnique({ where: { taskId_dependsOnTaskId: { taskId: id, dependsOnTaskId } } })) throw new HttpError(409, 'Dependency đã tồn tại.');
      const cycle = await tx.$queryRaw<{ id: string }[]>`WITH RECURSIVE reachable(id) AS (
        SELECT "depends_on_task_id" FROM "task_dependencies" WHERE "task_id" = ${dependsOnTaskId}::uuid AND "project_id" = ${task.projectId}::uuid
        UNION
        SELECT d."depends_on_task_id" FROM "task_dependencies" d JOIN reachable r ON d."task_id" = r.id WHERE d."project_id" = ${task.projectId}::uuid
      ) SELECT id FROM reachable WHERE id = ${id}::uuid LIMIT 1`;
      if (cycle.length) throw new HttpError(409, 'Dependency này tạo chu trình. Hãy chọn Task khác.');
      await tx.taskDependency.create({ data: { taskId: id, dependsOnTaskId, projectId: task.projectId } });
      await tx.task.update({ where: { id }, data: { updatedAt: new Date(Math.max(Date.now(), task.updatedAt.getTime() + 1)) } });
    }),
    removeDependency: (id: string, actorId: string, dependsOnTaskId: string) => taskMutation(id, actorId, true, async (tx, task) => {
      const result = await tx.taskDependency.deleteMany({ where: { taskId: id, dependsOnTaskId } });
      if (!result.count) throw new HttpError(404, 'Dependency không tồn tại.');
      await tx.task.update({ where: { id }, data: { updatedAt: new Date(Math.max(Date.now(), task.updatedAt.getTime() + 1)) } });
    }),
    async attachmentAccess(id: string, actorId: string) {
      const { project, projectMember } = await access(client, await taskProject(id), actorId);
      if (!projectMember) throw new HttpError(403, 'Chỉ thành viên Project được tải lên tệp.');
      if (project.status !== 'ACTIVE') throw new HttpError(409, 'Project đã đóng; không thể tải lên tệp.');
    },
    async attachments(id: string, actorId: string, page: number) {
      const { project, projectMember } = await access(client, await taskProject(id), actorId);
      return client.$transaction(async (tx) => {
        const items = await tx.attachment.findMany({ where: { taskId: id }, select: attachmentSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 });
        const total = await tx.attachment.count({ where: { taskId: id } });
        return { items: items.map((item) => ({ ...item, canDelete: project.status === 'ACTIVE' && Boolean(projectMember) && (item.uploadedBy === actorId || project.managerUserId === actorId) })), total, page, pageSize: 20, canUpload: project.status === 'ACTIVE' && Boolean(projectMember) };
      }, { isolationLevel: 'RepeatableRead' });
    },
    addAttachment: (id: string, actorId: string, filename: string, data: Buffer) => taskMutation(id, actorId, false, async (tx) => {
      const task = await tx.task.findUniqueOrThrow({ where: { id }, select: { projectId: true } });
      if (!await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: task.projectId, userId: actorId } } })) throw new HttpError(403, 'Chỉ thành viên Project được tải lên tệp.');
      return tx.attachment.create({ data: { taskId: id, uploadedBy: actorId, filename, sizeBytes: data.length, data: new Uint8Array(data) }, select: attachmentSelect });
    }),
    async downloadAttachment(id: string, attachmentId: string, actorId: string) {
      await access(client, await taskProject(id), actorId);
      const attachment = await client.attachment.findFirst({ where: { id: attachmentId, taskId: id } });
      if (!attachment) throw new HttpError(404, 'Tệp không tồn tại trong Task này.');
      return attachment;
    },
    removeAttachment: (id: string, attachmentId: string, actorId: string) => taskMutation(id, actorId, false, async (tx, task, project) => {
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: task.projectId, userId: actorId } } });
      if (!member) throw new HttpError(403, 'Chỉ thành viên Project được quản lý tệp.');
      const attachment = await tx.attachment.findFirst({ where: { id: attachmentId, taskId: id }, select: attachmentSelect });
      if (!attachment) throw new HttpError(404, 'Tệp không tồn tại trong Task này.');
      if (attachment.uploadedBy !== actorId && project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ người tải lên hoặc PM được xóa tệp.');
      await tx.attachment.delete({ where: { id: attachmentId } });
    }),
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
    myTasks: (actorId: string, query: TaskQuery) => list({ ...whereQuery(query), OR: [{ assigneeId: actorId }, { assignees: { some: { userId: actorId } } }], project: { members: { some: { userId: actorId, workspaceMember: { userId: actorId } } } } }, actorId, query),
    async detail(id: string, actorId: string) {
      const { projectMember } = await access(client, await taskProject(id), actorId);
      const task = await client.task.findUnique({ where: { id }, include });
      if (!task) throw new HttpError(404, 'Task không tồn tại.');
      return view(task, actorId, Boolean(projectMember));
    },
    create: (projectId: string, actorId: string, input: CreateTaskInput) => mutate(projectId, actorId, true, async (tx, project) => {
      const userIds = input.assigneeIds !== undefined ? toAssigneeIds(input.assigneeIds) : toAssigneeIds(input.assigneeId);
      await validateAssignees(tx, projectId, userIds);
      if (input.sprintId) {
        const sprint = await tx.sprint.findFirst({ where: { id: input.sprintId, projectId } });
        if (!sprint) throw new HttpError(400, 'Sprint được chọn phải thuộc Project này.', { sprintId: 'Chọn Sprint trong Project.' });
        if (sprint.status === 'COMPLETED') throw new HttpError(409, 'Sprint đã hoàn thành. Chọn Sprint khác hoặc Product Backlog.');
      }
      const start = input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null;
      const due = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
      validateTaskDates(start, due, project);
      const { assigneeId: _, assigneeIds: __, ...taskData } = input;
      const primaryAssigneeId = userIds[0] ?? null;
      const task = await tx.task.create({
        data: {
          ...dateData(taskData),
          title: input.title,
          projectId,
          assigneeId: primaryAssigneeId,
          sprintId: input.sprintId ?? null,
          assignees: { create: userIds.map((userId) => ({ userId })) },
        },
      });
      for (const uid of userIds) await notify(tx, uid, task.id, task.title);
      return result(tx, task.id, actorId);
    }),
    update: (id: string, actorId: string, input: UpdateTaskInput) => taskMutation(id, actorId, true, async (tx, task, project) => {
      const start = input.startDate === undefined ? task.startDate : input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null;
      const due = input.dueDate === undefined ? task.dueDate : input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
      validateTaskDates(start, due, project);
      await tx.task.update({ where: { id }, data: dateData(input) }); return result(tx, id, actorId);
    }),
    assign: (id: string, actorId: string, assigneeInput: string | null | string[]) => taskMutation(id, actorId, true, async (tx, task) => {
      const userIds = toAssigneeIds(assigneeInput);
      await validateAssignees(tx, task.projectId, userIds);
      const currentAssignees = await tx.taskAssignee.findMany({ where: { taskId: id }, select: { userId: true } });
      const currentUserIds = new Set(currentAssignees.map((item) => item.userId));
      if (task.assigneeId) currentUserIds.add(task.assigneeId);

      await tx.taskAssignee.deleteMany({ where: { taskId: id, userId: { notIn: userIds } } });
      const toAdd = userIds.filter((uid) => !currentUserIds.has(uid));
      const missingInTable = userIds.filter((uid) => !currentAssignees.some((item) => item.userId === uid));
      if (missingInTable.length) {
        await tx.taskAssignee.createMany({
          data: missingInTable.map((uid) => ({ taskId: id, userId: uid })),
          skipDuplicates: true,
        });
      }
      const primaryAssigneeId = userIds[0] ?? null;
      await tx.task.update({ where: { id }, data: { assigneeId: primaryAssigneeId } });
      for (const uid of toAdd) {
        await notify(tx, uid, id, task.title);
      }
      return result(tx, id, actorId);
    }),
    status: (id: string, actorId: string, input: StatusTaskInput) => taskMutation(id, actorId, false, async (tx, task, project) => {
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: actorId } } });
      const isAssigned = task.assigneeId === actorId || (await tx.taskAssignee.count({ where: { taskId: id, userId: actorId } })) > 0;
      if (project.managerUserId !== actorId && (!member || !isAssigned)) throw new HttpError(403, 'Chỉ PM hoặc người được giao Task được cập nhật trạng thái.');
      if (task.status !== input.expectedStatus) throw new HttpError(409, 'Trạng thái đã thay đổi. Tải lại Task trước khi cập nhật.');
      const currentIndex = taskStatuses.indexOf(task.status);
      const targetIndex = taskStatuses.indexOf(input.status);
      const step = targetIndex - currentIndex;
      if (input.status !== task.status && step !== 1 && step !== -1) throw new HttpError(409, 'Chỉ được chuyển trạng thái tăng hoặc giảm 1 bậc (TODO ↔ IN_PROGRESS ↔ REVIEW ↔ DONE).');
      const current = await result(tx, id, actorId);
      if (input.status !== task.status && step > 0 && current.blocked && !input.acknowledgeBlocked) throw new HttpError(409, 'Task đang BLOCKED vì còn dependency chưa DONE. Xem cảnh báo và xác nhận trước khi tiếp tục.');
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
