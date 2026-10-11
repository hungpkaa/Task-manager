import { z } from 'zod';
import type { AdminRepository } from '../repositories/admin.js';
import { tokenHash, type AuthService } from './auth.js';
import { HttpError } from '../domain/errors.js';
import { validate } from './auth-validation.js';
import { idSchema } from './workspace-validation.js';
import { adminUsersQuery, adminWorkspacesQuery, adminStatusInput } from './admin-validation.js';
export function createAdminService(repository: AdminRepository, auth: AuthService) {
  async function actor(token?: string) { const user = await auth.me(token); if (user.systemRole !== 'SYSTEM_ADMIN') throw new HttpError(403, 'Chỉ System Admin được quản trị hệ thống.'); return user.id; }
  return {
    async users(token: string | undefined, query: unknown) { return repository.users(await actor(token), validate(adminUsersQuery, query)); },
    async workspaces(token: string | undefined, query: unknown) { return repository.workspaces(await actor(token), validate(adminWorkspacesQuery, query)); },
    async statistics(token: string | undefined, query: unknown) { const id = await actor(token); validate(z.object({}).strict(), query); return repository.statistics(id); },
    async changeStatus(token: string | undefined, userId: unknown, input: unknown) { return repository.changeStatus(await actor(token), validate(idSchema, userId), validate(adminStatusInput, input), tokenHash(token)!); },
  };
}
export type AdminService = ReturnType<typeof createAdminService>;
