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
    update: (workspaceId: string, actorId: string, data: { name?: string; description?: string }) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status !== 'ACTIVE') throw new HttpError(409, 'Workspace đã đóng; không thể thay đổi thông tin.');
      const updated = await transaction.workspace.update({ where: { id: workspaceId }, data });
      return { ...updated, myRole: 'OWNER' as const, memberCount: await transaction.workspaceMember.count({ where: { workspaceId } }) };
    }),
    close: (workspaceId: string, actorId: string) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status === 'CLOSED') {
        return { ...workspace, myRole: 'OWNER' as const, memberCount: await transaction.workspaceMember.count({ where: { workspaceId } }) };
      }
      const activeProjects = await transaction.project.count({ where: { workspaceId, status: 'ACTIVE' } });
      if (activeProjects > 0) {
        throw new HttpError(409, 'Còn Project đang hoạt động. Hãy hoàn thành hoặc đóng tất cả Project trước khi xóa Workspace.');
      }
      const closed = await transaction.workspace.update({ where: { id: workspaceId }, data: { status: 'CLOSED', closedAt: new Date() } });
      const members = await transaction.workspaceMember.findMany({ where: { workspaceId } });
      for (const member of members) {
        if (member.userId !== actorId) {
          await transaction.notification.create({ data: {
            userId: member.userId, type: 'WORKSPACE_CLOSED', title: 'Workspace đã đóng',
            message: `Workspace “${workspace.name}” đã được đóng và chuyển sang lưu trữ.`, relatedEntityType: 'WORKSPACE', relatedEntityId: workspaceId,
          } });
        }
      }
      return { ...closed, myRole: 'OWNER' as const, memberCount: members.length };
    }),
    reopen: (workspaceId: string, actorId: string) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status === 'ACTIVE') {
        return { ...workspace, myRole: 'OWNER' as const, memberCount: await transaction.workspaceMember.count({ where: { workspaceId } }) };
      }
      const reopened = await transaction.workspace.update({ where: { id: workspaceId }, data: { status: 'ACTIVE', closedAt: null } });
      const members = await transaction.workspaceMember.findMany({ where: { workspaceId } });
      for (const member of members) {
        if (member.userId !== actorId) {
          await transaction.notification.create({ data: {
            userId: member.userId, type: 'WORKSPACE_REOPENED', title: 'Workspace đã mở lại',
            message: `Workspace “${workspace.name}” đã được mở lại hoạt động.`, relatedEntityType: 'WORKSPACE', relatedEntityId: workspaceId,
          } });
        }
      }
      return { ...reopened, myRole: 'OWNER' as const, memberCount: members.length };
    }),
    invite: (workspaceId: string, actorId: string, email: string) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status !== 'ACTIVE') throw new HttpError(409, 'Workspace đã đóng; không thể thêm thành viên.');
      const user = await transaction.user.findUnique({ where: { email }, select: memberUser });
      if (!user) throw new HttpError(404, 'Email này chưa có tài khoản trong hệ thống.', { email: 'Người được mời cần đăng ký tài khoản trước.' });
      if (user.status !== 'ACTIVE') throw new HttpError(409, 'Tài khoản được mời đang bị khóa.');
      const existing = await transaction.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } });
      if (existing) throw new HttpError(409, 'Người dùng đã là thành viên của Workspace.', { email: 'Thành viên đã tồn tại.' });
      const pending = await transaction.workspaceInvitation.findFirst({ where: { workspaceId, inviteeId: user.id, status: 'PENDING' } });
      if (pending) throw new HttpError(409, 'Lời mời tham gia Workspace đang chờ người dùng phản hồi.', { email: 'Đã gửi lời mời trước đó.' });
      const oldInvitation = await transaction.workspaceInvitation.findFirst({
        where: { workspaceId, inviteeId: user.id, status: { in: ['DECLINED', 'CANCELED'] } },
        orderBy: { createdAt: 'desc' },
      });
      const invitation = oldInvitation
        ? await transaction.workspaceInvitation.update({
            where: { id: oldInvitation.id },
            data: { status: 'PENDING', inviterId: actorId },
            include: { invitee: { select: memberUser } },
          })
        : await transaction.workspaceInvitation.create({
            data: { workspaceId, inviterId: actorId, inviteeId: user.id, role: 'MEMBER' },
            include: { invitee: { select: memberUser } },
          });
      await transaction.notification.create({ data: {
        userId: user.id, type: 'WORKSPACE_INVITATION', title: 'Bạn nhận được lời mời vào Workspace',
        message: `Bạn được mời tham gia Workspace “${workspace.name}”. Hãy chấp nhận hoặc từ chối lời mời.`, relatedEntityType: 'WORKSPACE_INVITATION', relatedEntityId: invitation.id,
      } });
      return { ...invitation, user: invitation.invitee, workspaceName: workspace.name };
    }),
    pendingInvitations: (workspaceId: string, actorId: string) => asOwner(workspaceId, actorId, async (transaction) => {
      return transaction.workspaceInvitation.findMany({
        where: { workspaceId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { invitee: { select: memberUser } },
      });
    }),
    invitationEmail: (workspaceId: string, actorId: string, targetId: string) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status !== 'ACTIVE') throw new HttpError(409, 'Workspace đã đóng; không thể gửi email.');
      const invitation = await transaction.workspaceInvitation.findFirst({
        where: { workspaceId, status: 'PENDING', OR: [{ id: targetId }, { inviteeId: targetId }] },
        include: { invitee: { select: memberUser } },
      });
      if (!invitation) throw new HttpError(404, 'Không tìm thấy lời mời đang chờ phản hồi trong Workspace này.');
      if (invitation.invitee.status !== 'ACTIVE') throw new HttpError(409, 'Tài khoản được mời đang bị khóa.');
      await transaction.notification.create({ data: {
        userId: invitation.inviteeId, type: 'WORKSPACE_INVITATION', title: 'Nhắc nhở: Lời mời vào Workspace',
        message: `Bạn có lời mời tham gia Workspace “${workspace.name}”. Hãy chấp nhận hoặc từ chối lời mời.`, relatedEntityType: 'WORKSPACE_INVITATION', relatedEntityId: invitation.id,
      } });
      return { workspaceName: workspace.name, email: invitation.invitee.email };
    }),
    cancelInvitation: (workspaceId: string, actorId: string, invitationId: string) => asOwner(workspaceId, actorId, async (transaction) => {
      const invitation = await transaction.workspaceInvitation.findFirst({
        where: { id: invitationId, workspaceId, status: 'PENDING' },
      });
      if (!invitation) throw new HttpError(404, 'Không tìm thấy lời mời đang chờ phản hồi.');
      await transaction.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'CANCELED' } });
    }),
    myInvitations: async (userId: string) => {
      return client.workspaceInvitation.findMany({
        where: { inviteeId: userId, status: 'PENDING', workspace: { status: 'ACTIVE' } },
        orderBy: { createdAt: 'desc' },
        include: {
          workspace: { select: { id: true, name: true, description: true } },
          inviter: { select: memberUser },
        },
      });
    },
    acceptInvitation: async (invitationId: string, userId: string) => client.$transaction(async (transaction) => {
      const invitation = await transaction.workspaceInvitation.findUnique({
        where: { id: invitationId },
        include: { workspace: true, invitee: { select: memberUser } },
      });
      if (!invitation || invitation.inviteeId !== userId) throw new HttpError(404, 'Không tìm thấy lời mời.');
      if (invitation.status !== 'PENDING') throw new HttpError(409, 'Lời mời này đã được phản hồi hoặc không còn hiệu lực.');
      if (invitation.workspace.status !== 'ACTIVE') throw new HttpError(409, 'Workspace đã đóng; không thể tham gia.');

      await transaction.workspaceInvitation.update({ where: { id: invitationId }, data: { status: 'ACCEPTED' } });
      await transaction.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
        create: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
        update: { role: invitation.role },
      });
      await transaction.notification.create({ data: {
        userId: invitation.inviterId, type: 'WORKSPACE_INVITATION_ACCEPTED', title: 'Lời mời Workspace đã được chấp nhận',
        message: `“${invitation.invitee.displayName}” đã chấp nhận lời mời tham gia Workspace “${invitation.workspace.name}”.`,
        relatedEntityType: 'WORKSPACE', relatedEntityId: invitation.workspaceId,
      } });
      return { ...invitation.workspace, myRole: invitation.role };
    }),
    declineInvitation: async (invitationId: string, userId: string) => client.$transaction(async (transaction) => {
      const invitation = await transaction.workspaceInvitation.findUnique({
        where: { id: invitationId },
        include: { workspace: true, invitee: { select: memberUser } },
      });
      if (!invitation || invitation.inviteeId !== userId) throw new HttpError(404, 'Không tìm thấy lời mời.');
      if (invitation.status !== 'PENDING') throw new HttpError(409, 'Lời mời này đã được phản hồi hoặc không còn hiệu lực.');

      await transaction.workspaceInvitation.update({ where: { id: invitationId }, data: { status: 'DECLINED' } });
      await transaction.notification.create({ data: {
        userId: invitation.inviterId, type: 'WORKSPACE_INVITATION_DECLINED', title: 'Lời mời Workspace bị từ chối',
        message: `“${invitation.invitee.displayName}” đã từ chối lời mời tham gia Workspace “${invitation.workspace.name}”.`,
        relatedEntityType: 'WORKSPACE', relatedEntityId: invitation.workspaceId,
      } });
      return { success: true };
    }),
    changeRole: (workspaceId: string, actorId: string, userId: string, role: WorkspaceRole) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status !== 'ACTIVE') throw new HttpError(409, 'Workspace đã đóng; không thể thay đổi vai trò.');
      if (role === 'MEMBER') await keepOwner(transaction, workspaceId, userId);
      const member = await transaction.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
      if (!member) throw new HttpError(404, 'Thành viên không tồn tại trong Workspace này.');
      return transaction.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role }, include: { user: { select: memberUser } } });
    }),
    removeMember: (workspaceId: string, actorId: string, userId: string) => asOwner(workspaceId, actorId, async (transaction, workspace) => {
      if (workspace.status !== 'ACTIVE') throw new HttpError(409, 'Workspace đã đóng; không thể xóa thành viên.');
      await keepOwner(transaction, workspaceId, userId);
      if (await transaction.project.count({ where: { workspaceId, managerUserId: userId } })) throw new HttpError(409, 'Thành viên đang giữ vai trò PM. Hãy chuyển giao PM trước khi xóa khỏi Workspace.');
      if (await transaction.task.count({ where: { project: { workspaceId }, OR: [{ assigneeId: userId }, { assignees: { some: { userId } } }], status: { not: 'DONE' } } })) throw new HttpError(409, 'Thành viên còn Task chưa DONE. Chuyển giao hoặc bỏ phân công trước khi xóa khỏi Workspace.');
      await transaction.projectMember.deleteMany({ where: { workspaceId, userId } });
      await transaction.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    }),
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
