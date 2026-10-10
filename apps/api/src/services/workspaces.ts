import type { WorkspaceRepository } from '../repositories/workspaces.js';
import type { NotificationRepository } from '../repositories/notifications.js';
import type { AuthService } from './auth.js';
import { validate } from './auth-validation.js';
import { createWorkspaceSchema, updateWorkspaceSchema, inviteMemberSchema, memberRoleSchema, idSchema } from './workspace-validation.js';

export function createWorkspaceService(repository: WorkspaceRepository, auth: AuthService) {
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
    async invite(token: string | undefined, id: unknown, input: unknown) {
      const user = await auth.me(token);
      return repository.invite(validate(idSchema, id), user.id, validate(inviteMemberSchema, input).email);
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
    async list(token: string | undefined) { return repository.list((await auth.me(token)).id); },
    async markRead(token: string | undefined, id: unknown) {
      const user = await auth.me(token);
      return repository.markRead(validate(idSchema, id), user.id);
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
export type NotificationService = ReturnType<typeof createNotificationService>;
