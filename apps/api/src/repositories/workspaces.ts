import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';

type Client = PrismaClient | Prisma.TransactionClient;
type WorkspaceRole = 'OWNER' | 'MEMBER';
const memberUser = { id: true, email: true, displayName: true, status: true } as const;

async function access(client: Client, workspaceId: string, userId: string, ownerOnly = false) {
  const workspace = await client.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new HttpError(404, 'Workspace không tồn tại.');
  const membership = await client.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!membership || (ownerOnly && membership.role !== 'OWNER')) throw new HttpError(403, 'Bạn không có quyền thực hiện thao tác trong Workspace này.');
  return { workspace, membership };
}

export function createWorkspaceRepository(client: PrismaClient) {
  // Serialize workspace mutations; recheck the actor's role after acquiring the lock.
  // This prevents concurrent owner demotions/removals from leaving zero owners.
  async function asOwner<T>(workspaceId: string, actorId: string, operation: (transaction: Prisma.TransactionClient, workspace: Awaited<ReturnType<typeof access>>['workspace']) => Promise<T>) {
    return client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`;
      const { workspace } = await access(transaction, workspaceId, actorId, true);
      return operation(transaction, workspace);
    });
  }
  async function keepOwner(transaction: Prisma.TransactionClient, workspaceId: string, userId: string) {
    const member = await transaction.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member) throw new HttpError(404, 'Thành viên không tồn tại trong Workspace này.');
    if (member.role === 'OWNER' && await transaction.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } }) <= 1) {
      throw new HttpError(409, 'Workspace phải luôn có ít nhất một Owner.');
    }
    return member;
  }

  return {
    create: (userId: string, data: { name: string; description: string }) => client.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({ data: { ...data, createdBy: userId } });
      await transaction.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: 'OWNER' } });
      return { ...workspace, myRole: 'OWNER' as const, memberCount: 1 };
    }),
    async list(userId: string) {
      const memberships = await client.workspaceMember.findMany({
        where: { userId }, orderBy: [{ joinedAt: 'desc' }, { workspaceId: 'asc' }],
        include: { workspace: { include: { _count: { select: { members: true } } } } },
      });
      return memberships.map(({ role, workspace: { _count, ...workspace } }) => ({ ...workspace, myRole: role, memberCount: _count.members }));
    },
    async detail(workspaceId: string, userId: string) {
      const { workspace, membership } = await access(client, workspaceId, userId);
      return { ...workspace, myRole: membership.role, memberCount: await client.workspaceMember.count({ where: { workspaceId } }) };
    },
    async members(workspaceId: string, userId: string) {
      await access(client, workspaceId, userId);
      return client.workspaceMember.findMany({ where: { workspaceId }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }, { userId: 'asc' }], include: { user: { select: memberUser } } });
    },
    update: (workspaceId: string, actorId: string, data: { name?: string; description?: string }) => asOwner(workspaceId, actorId, async (transaction) => {
      const workspace = await transaction.workspace.update({ where: { id: workspaceId }, data });
      return { ...workspace, myRole: 'OWNER' as const, memberCount: await transaction.workspaceMember.count({ where: { workspaceId } }) };
    }),
    invite: (workspaceId: string, actorId: string, email: string) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      const user = await transaction.user.findUnique({ where: { email }, select: memberUser });
      if (!user) throw new HttpError(404, 'Email này chưa có tài khoản trong hệ thống.', { email: 'Người được mời cần đăng ký tài khoản trước.' });
      if (user.status !== 'ACTIVE') throw new HttpError(409, 'Tài khoản được mời đang bị khóa.');
      const existing = await transaction.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } });
      if (existing) throw new HttpError(409, 'Người dùng đã là thành viên của Workspace.', { email: 'Thành viên đã tồn tại.' });
      const member = await transaction.workspaceMember.create({ data: { workspaceId, userId: user.id, role: 'MEMBER' }, include: { user: { select: memberUser } } });
      await transaction.notification.create({ data: {
        userId: user.id, type: 'WORKSPACE_INVITATION', title: 'Bạn được mời vào Workspace',
        message: `Bạn đã được thêm vào Workspace “${workspace.name}”.`, relatedEntityType: 'WORKSPACE', relatedEntityId: workspaceId,
      } });
      return member;
    }),
    changeRole: (workspaceId: string, actorId: string, userId: string, role: WorkspaceRole) => asOwner(workspaceId, actorId, async (transaction) => {
      if (role === 'MEMBER') await keepOwner(transaction, workspaceId, userId);
      const member = await transaction.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
      if (!member) throw new HttpError(404, 'Thành viên không tồn tại trong Workspace này.');
      return transaction.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role }, include: { user: { select: memberUser } } });
    }),
    removeMember: (workspaceId: string, actorId: string, userId: string) => asOwner(workspaceId, actorId, async (transaction) => {
      await keepOwner(transaction, workspaceId, userId);
      if (await transaction.project.count({ where: { workspaceId, managerUserId: userId } })) throw new HttpError(409, 'Thành viên đang giữ vai trò PM. Hãy chuyển giao PM trước khi xóa khỏi Workspace.');
      if (await transaction.task.count({ where: { project: { workspaceId }, assigneeId: userId, status: { not: 'DONE' } } })) throw new HttpError(409, 'Thành viên còn Task chưa DONE. Chuyển giao hoặc bỏ phân công trước khi xóa khỏi Workspace.');
      await transaction.projectMember.deleteMany({ where: { workspaceId, userId } });
      await transaction.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    }),
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
