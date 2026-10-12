import type { WorkspaceRepository } from '../repositories/workspaces.js';
import type { NotificationRepository } from '../repositories/notifications.js';
import type { AuthService } from './auth.js';
import type { EmailSender } from './email.js';
import { validate } from './auth-validation.js';
import { notificationQuerySchema } from './notification-validation.js';
import { createWorkspaceSchema, updateWorkspaceSchema, inviteMemberSchema, memberRoleSchema, idSchema } from './workspace-validation.js';

export function createWorkspaceService(repository: WorkspaceRepository, auth: AuthService, email?: { sender: EmailSender; appOrigin: string }) {
  async function invitation(workspaceName: string, recipient: string) {
    if (!email?.sender.enabled) return 'DISABLED' as const;
    try {
      await email.sender.send({ to: recipient, subject: 'Bạn được mời vào Workspace — Task Manager', text: `Bạn nhận được lời mời tham gia Workspace “${workspaceName}”.\n\nMở ${email.appOrigin}/ và đăng nhập tài khoản để chọn Chấp nhận hoặc Từ chối lời mời tham gia Workspace.\n\nĐây là email mời tham gia Workspace; email này không chứa mật khẩu.` });
      return email.sender.local ? 'LOCAL' as const : 'SENT' as const;
    } catch { console.error('Không gửi được email mời Workspace; membership và thông báo vẫn được giữ.'); return 'FAILED' as const; }
  }
  return {
    async list(token: string | undefined) { return repository.list((await auth.me(token)).id); },
    async create(token: string | undefined, input: unknown) {
      const user = await auth.me(token);
      return repository.create(user.id, validate(createWorkspaceSchema, input));
    },
    async detail(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.detail(validate(idSchema, id), user.id);
    },
    async members(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.members(validate(idSchema, id), user.id);
    },
    async update(token: string | undefined, id: unknown, input: unknown) {
      const user = await auth.me(token);
      return repository.update(validate(idSchema, id), user.id, validate(updateWorkspaceSchema, input));
    },
    async close(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.close(validate(idSchema, id), user.id);
    },
    async reopen(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.reopen(validate(idSchema, id), user.id);
    },
    async invite(token: string | undefined, id: unknown, input: unknown) {
      const user = await auth.me(token);
      const member = await repository.invite(validate(idSchema, id), user.id, validate(inviteMemberSchema, input).email);
      return { ...member, emailDelivery: await invitation(member.workspaceName, member.user.email) };
    },
    async pendingInvitations(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.pendingInvitations(validate(idSchema, id), user.id);
    },
    async resendInvitation(token: string | undefined, id: unknown, memberId: unknown) {
      const user = await auth.me(token);
      const target = await repository.invitationEmail(validate(idSchema, id), user.id, validate(idSchema, memberId));
      return { delivery: await invitation(target.workspaceName, target.email) };
    },
    async cancelInvitation(token: string | undefined, id: unknown, invitationId: unknown) {
      const user = await auth.me(token);
      await repository.cancelInvitation(validate(idSchema, id), user.id, validate(idSchema, invitationId));
    },
    async myInvitations(token: string | undefined) {
      const user = await auth.me(token);
      return repository.myInvitations(user.id);
    },
    async acceptInvitation(token: string | undefined, invitationId: unknown) {
      const user = await auth.me(token);
      return repository.acceptInvitation(validate(idSchema, invitationId), user.id);
    },
    async declineInvitation(token: string | undefined, invitationId: unknown) {
      const user = await auth.me(token);
      return repository.declineInvitation(validate(idSchema, invitationId), user.id);
    },
    async changeRole(token: string | undefined, id: unknown, memberId: unknown, input: unknown) {
      const user = await auth.me(token);
      return repository.changeRole(validate(idSchema, id), user.id, validate(idSchema, memberId), validate(memberRoleSchema, input).role);
    },
    async removeMember(token: string | undefined, id: unknown, memberId: unknown) {
      const user = await auth.me(token);
      return repository.removeMember(validate(idSchema, id), user.id, validate(idSchema, memberId));
    },
  };
}

export function createNotificationService(repository: NotificationRepository, auth: AuthService) {
  return {
    async list(token: string | undefined, query: unknown = {}) { const user = await auth.me(token); return repository.list(user.id, validate(notificationQuerySchema, query)); },
    async markRead(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.markRead(validate(idSchema, id), user.id);
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
export type NotificationService = ReturnType<typeof createNotificationService>;
