import type { ProjectRepository } from '../repositories/projects.js';
import type { AuthService } from './auth.js';
import { validate } from './auth-validation.js';
import { idSchema } from './workspace-validation.js';
import { createProjectSchema, updateProjectSchema, managerSchema, projectMemberSchema } from './project-validation.js';
import { capacitySchema, capacityQuerySchema, workloadQuerySchema, riskQuerySchema } from './coordination-validation.js';
import { calendarQuerySchema } from './calendar-validation.js';
import { z } from 'zod';

export function createProjectService(repository: ProjectRepository, auth: AuthService) {
  return {
    async personalDashboard(token: string | undefined, query: unknown) { const user = await auth.me(token); validate(z.object({}).strict(), query); return repository.personalDashboard(user.id); },
    async dashboard(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.dashboard(validate(idSchema, projectId), user.id, validate(riskQuerySchema, query)); },
    async calendar(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.calendar(validate(idSchema, projectId), user.id, validate(calendarQuerySchema, query)); },
    async recommendations(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.recommendations(validate(idSchema, projectId), user.id, validate(workloadQuerySchema, query)); },
    async risk(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.risk(validate(idSchema, projectId), user.id, validate(riskQuerySchema, query)); },
    async workload(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.workload(validate(idSchema, projectId), user.id, validate(workloadQuerySchema, query)); },
    async capacities(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.capacities(validate(idSchema, projectId), user.id, validate(capacityQuerySchema, query).page); },
    async saveCapacity(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); return repository.saveCapacity(validate(idSchema, projectId), user.id, validate(capacitySchema, input)); },
    async list(token: string | undefined, workspaceId: unknown) { const user = await auth.me(token); return repository.list(validate(idSchema, workspaceId), user.id); },
    async create(token: string | undefined, workspaceId: unknown, input: unknown) { const user = await auth.me(token); return repository.create(validate(idSchema, workspaceId), user.id, validate(createProjectSchema, input)); },
    async detail(token: string | undefined, projectId: unknown) { const user = await auth.me(token); return repository.detail(validate(idSchema, projectId), user.id); },
    async update(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); return repository.update(validate(idSchema, projectId), user.id, validate(updateProjectSchema, input)); },
    async assignManager(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); const data = validate(managerSchema, input); return repository.assignManager(validate(idSchema, projectId), user.id, data.managerUserId, data.expectedManagerUserId); },
    async close(token: string | undefined, projectId: unknown) { const user = await auth.me(token); return repository.close(validate(idSchema, projectId), user.id); },
    async members(token: string | undefined, projectId: unknown) { const user = await auth.me(token); return repository.members(validate(idSchema, projectId), user.id); },
    async addMember(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); return repository.addMember(validate(idSchema, projectId), user.id, validate(projectMemberSchema, input).userId); },
    async removeMember(token: string | undefined, projectId: unknown, userId: unknown) { const user = await auth.me(token); return repository.removeMember(validate(idSchema, projectId), user.id, validate(idSchema, userId)); },
  };
}
export type ProjectService = ReturnType<typeof createProjectService>;
