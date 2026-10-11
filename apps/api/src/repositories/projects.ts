import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';
import type { ProjectInput } from '../services/project-validation.js';
import type { CapacityInput, WorkloadQuery } from '../services/coordination-validation.js';
import { workload } from './workload.js';
import { projectRisk } from './project-risk.js';
import { recommendations } from './recommendations.js';

type Client = PrismaClient | Prisma.TransactionClient;
const userSelect = { id: true, email: true, displayName: true, status: true } as const;
const projectInclude = { manager: { include: { user: { select: userSelect } } }, _count: { select: { members: true } } } as const;
async function workspaceAccess(client: Client, workspaceId: string, actorId: string) {
  const workspace = await client.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new HttpError(404, 'Workspace không tồn tại.');
  const member = await client.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } } });
  if (!member) throw new HttpError(403, 'Bạn không thuộc Workspace này.');
  return member;
}
async function projectAccess(client: Client, projectId: string, actorId: string) {
  const project = await client.project.findUnique({ where: { id: projectId }, include: projectInclude });
  if (!project) throw new HttpError(404, 'Project không tồn tại.');
  const workspaceMember = await workspaceAccess(client, project.workspaceId, actorId);
  const member = await client.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } });
  if (workspaceMember.role !== 'OWNER' && !member) throw new HttpError(403, 'Bạn không có quyền truy cập Project này.');
  return { project, workspaceMember };
}
function view({ project, workspaceMember }: Awaited<ReturnType<typeof projectAccess>>, actorId: string) {
  const { manager, _count, ...data } = project;
  return { ...data, manager: manager?.user ?? null, memberCount: _count.members,
    isWorkspaceOwner: workspaceMember.role === 'OWNER', isManager: project.managerUserId === actorId };
}
function active(status: string) { if (status !== 'ACTIVE') throw new HttpError(409, 'Project đã đóng; chỉ có thể xem dữ liệu.'); }
function dateData(input: ProjectInput) {
  return { ...input,
    ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null } : {}),
  };
}
export function createProjectRepository(client: PrismaClient) {
  // Same workspace lock as membership changes: manager assignment and removals cannot race.
  async function mutate<T>(projectId: string, actorId: string, role: 'OWNER' | 'MANAGER', operation: (tx: Prisma.TransactionClient, project: Awaited<ReturnType<typeof projectAccess>>['project']) => Promise<T>) {
    return client.$transaction(async (tx) => {
      const located = await tx.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
      if (!located) throw new HttpError(404, 'Project không tồn tại.');
      await tx.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${located.workspaceId}::uuid FOR UPDATE`;
      const access = await projectAccess(tx, projectId, actorId);
      if (role === 'OWNER' ? access.workspaceMember.role !== 'OWNER' : access.project.managerUserId !== actorId) throw new HttpError(403, role === 'OWNER' ? 'Chỉ Workspace Owner được phân công PM.' : 'Chỉ PM được quản lý Project được giao.');
      return operation(tx, access.project);
    });
  }
  async function candidate(tx: Client, workspaceId: string, userId: string) {
    const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, include: { user: { select: userSelect } } });
    if (!member) throw new HttpError(400, 'Người được chọn phải thuộc Workspace.');
    if (member.user.status !== 'ACTIVE') throw new HttpError(409, 'Tài khoản được chọn đang bị khóa.');
    return member;
  }
  async function notify(tx: Prisma.TransactionClient, userId: string, projectId: string, name: string, type: string, message: string) {
    await tx.notification.create({ data: { userId, type, title: 'Cập nhật Project', message: `${message} “${name}”.`, relatedEntityType: 'PROJECT', relatedEntityId: projectId } });
  }
  return {
    async recommendations(projectId: string, actorId: string, query: WorkloadQuery, now = new Date()) {
      return client.$transaction(async (tx) => {
        const { project } = await projectAccess(tx, projectId, actorId);
        if (project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ PM được xem đề xuất điều phối.');
        return recommendations(tx, project, query, now);
      }, { isolationLevel: 'RepeatableRead' });
    },
    async risk(projectId: string, actorId: string, period: { periodStart: string; periodEnd: string }, now = new Date()) {
      return client.$transaction(async (tx) => {
        const { project } = await projectAccess(tx, projectId, actorId);
        if (project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ PM được xem Risk của Project.');
        return projectRisk(tx, project, period, now);
      }, { isolationLevel: 'RepeatableRead' });
    },
    async workload(projectId: string, actorId: string, query: WorkloadQuery) {
      return client.$transaction(async (tx) => {
        const { project } = await projectAccess(tx, projectId, actorId);
        if (project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ PM được xem điều phối Project.');
        return { ...await workload(tx, projectId, query), risk: await projectRisk(tx, project, query), canEdit: project.status === 'ACTIVE' };
      }, { isolationLevel: 'RepeatableRead' });
    },
    async capacities(projectId: string, actorId: string, page: number) {
      return client.$transaction(async (tx) => {
        const { project } = await projectAccess(tx, projectId, actorId);
        if (project.managerUserId !== actorId) throw new HttpError(403, 'Chỉ PM được xem điều phối Project.');
        return { items: await tx.memberCapacity.findMany({ where: { projectId }, include: { user: { select: userSelect } }, orderBy: [{ periodStart: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), total: await tx.memberCapacity.count({ where: { projectId } }), page, pageSize: 20 };
      }, { isolationLevel: 'RepeatableRead' });
    },
    saveCapacity: (projectId: string, actorId: string, input: CapacityInput) => mutate(projectId, actorId, 'MANAGER', async (tx, project) => {
      active(project.status);
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: input.userId } } });
      if (!member) throw new HttpError(400, 'Capacity chỉ dành cho thành viên Project hiện tại.');
      await candidate(tx, project.workspaceId, input.userId);
      const periodStart = new Date(input.periodStart); const periodEnd = new Date(input.periodEnd);
      const existing = await tx.memberCapacity.findUnique({ where: { projectId_userId_periodStart_periodEnd: { projectId, userId: input.userId, periodStart, periodEnd } } });
      if ((existing?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) throw new HttpError(409, 'Capacity đã thay đổi. Tải lại Workload trước khi lưu.');
      const overlap = await tx.memberCapacity.findFirst({ where: { projectId, userId: input.userId, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart }, ...(existing ? { id: { not: existing.id } } : {}) } });
      if (overlap) throw new HttpError(409, 'Kỳ Capacity chồng với kỳ đã lưu. Chọn đúng kỳ để cập nhật hoặc chọn kỳ không chồng nhau.');
      const capacity = existing
        ? await tx.memberCapacity.update({ where: { id: existing.id }, data: { capacityPoints: input.capacityPoints, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) } })
        : await tx.memberCapacity.create({ data: { projectId, userId: input.userId, periodStart, periodEnd, capacityPoints: input.capacityPoints } });
      return capacity;
    }),
    async list(workspaceId: string, actorId: string) {
      const membership = await workspaceAccess(client, workspaceId, actorId);
      const projects = await client.project.findMany({ where: { workspaceId, ...(membership.role === 'OWNER' ? {} : { members: { some: { userId: actorId } } }) }, include: projectInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
      return projects.map((project) => view({ project, workspaceMember: membership }, actorId));
    },
    detail: async (projectId: string, actorId: string) => view(await projectAccess(client, projectId, actorId), actorId),
    async create(workspaceId: string, actorId: string, input: Required<ProjectInput>) {
      return client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`;
        const member = await workspaceAccess(tx, workspaceId, actorId);
        if (member.role !== 'OWNER') throw new HttpError(403, 'Chỉ Workspace Owner được tạo Project.');
        const project = await tx.project.create({ data: { ...dateData(input), name: input.name, workspaceId }, include: projectInclude });
        return view({ project, workspaceMember: member }, actorId);
      });
    },
    update: (projectId: string, actorId: string, input: ProjectInput) => mutate(projectId, actorId, 'MANAGER', async (tx, project) => {
      active(project.status);
      const start = input.startDate === undefined ? project.startDate : input.startDate ? new Date(input.startDate) : null;
      const end = input.endDate === undefined ? project.endDate : input.endDate ? new Date(input.endDate) : null;
      if (start && end && end < start) throw new HttpError(400, 'Ngày kết thúc không được trước ngày bắt đầu.', { endDate: 'Kiểm tra khoảng thời gian Project.' });
      await tx.project.update({ where: { id: projectId }, data: dateData(input) });
      return view(await projectAccess(tx, projectId, actorId), actorId);
    }),
    assignManager: (projectId: string, actorId: string, userId: string, expectedManagerUserId: string | null) => mutate(projectId, actorId, 'OWNER', async (tx, project) => {
      // Owner may transfer responsibility on a closed project without reopening its content.
      if (project.managerUserId !== expectedManagerUserId) throw new HttpError(409, 'PM đã thay đổi. Tải lại Project và xác nhận người thay thế.');
      await candidate(tx, project.workspaceId, userId);
      if (project.managerUserId !== userId) {
        await tx.projectMember.upsert({ where: { projectId_userId: { projectId, userId } }, create: { projectId, userId, workspaceId: project.workspaceId }, update: {} });
        await tx.project.update({ where: { id: projectId }, data: { managerUserId: userId } });
        await notify(tx, userId, projectId, project.name, 'PROJECT_MANAGER_ASSIGNED', 'Bạn được phân công làm PM của Project');
        if (project.managerUserId) await notify(tx, project.managerUserId, projectId, project.name, 'PROJECT_MANAGER_REPLACED', 'Vai trò PM của bạn đã được chuyển giao tại Project');
      }
      return view(await projectAccess(tx, projectId, actorId), actorId);
    }),
    close: (projectId: string, actorId: string) => mutate(projectId, actorId, 'MANAGER', async (tx, project) => {
      if (project.status !== 'CLOSED') {
        if (await tx.task.count({ where: { projectId, status: { not: 'DONE' } } })) throw new HttpError(409, 'Còn Task chưa DONE. Hoàn thành công việc trước khi đóng Project.');
        if (await tx.sprint.count({ where: { projectId, status: 'ACTIVE' } })) throw new HttpError(409, 'Còn Sprint ACTIVE. Kết thúc Sprint trước khi đóng Project.');
        await tx.project.update({ where: { id: projectId }, data: { status: 'CLOSED', closedAt: new Date() } });
        const members = await tx.projectMember.findMany({ where: { projectId } });
        for (const member of members) await notify(tx, member.userId, projectId, project.name, 'PROJECT_CLOSED', 'Project đã đóng');
      }
      return view(await projectAccess(tx, projectId, actorId), actorId);
    }),
    async members(projectId: string, actorId: string) {
      await projectAccess(client, projectId, actorId);
      const members = await client.projectMember.findMany({ where: { projectId }, orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }], include: { workspaceMember: { include: { user: { select: userSelect } } } } });
      return members.map(({ workspaceMember, ...member }) => ({ ...member, user: workspaceMember.user }));
    },
    addMember: (projectId: string, actorId: string, userId: string) => mutate(projectId, actorId, 'MANAGER', async (tx, project) => {
      active(project.status); await candidate(tx, project.workspaceId, userId);
      if (await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })) throw new HttpError(409, 'Người dùng đã thuộc Project.');
      const member = await tx.projectMember.create({ data: { projectId, userId, workspaceId: project.workspaceId } });
      await notify(tx, userId, projectId, project.name, 'PROJECT_MEMBER_ADDED', 'Bạn được thêm vào Project');
      return member;
    }),
    removeMember: (projectId: string, actorId: string, userId: string) => mutate(projectId, actorId, 'MANAGER', async (tx, project) => {
      active(project.status);
      if (project.managerUserId === userId) throw new HttpError(409, 'Hãy chuyển giao PM trước khi xóa thành viên này.');
      if (!await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })) throw new HttpError(404, 'Thành viên không thuộc Project.');
      if (await tx.task.count({ where: { projectId, assigneeId: userId, status: { not: 'DONE' } } })) throw new HttpError(409, 'Thành viên còn Task chưa DONE. Chuyển giao hoặc bỏ phân công trước khi xóa.');
      await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
      await notify(tx, userId, projectId, project.name, 'PROJECT_MEMBER_REMOVED', 'Bạn đã được xóa khỏi Project');
    }),
  };
}
export type ProjectRepository = ReturnType<typeof createProjectRepository>;
