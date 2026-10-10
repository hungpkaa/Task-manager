import type { SprintRepository } from '../repositories/sprints.js';
import type { AuthService } from './auth.js';
import { validate } from './auth-validation.js';
import { idSchema } from './workspace-validation.js';
import { backlogQuery, planningInput, returnInput, sprintInput } from './sprint-validation.js';
export function createSprintService(repository: SprintRepository, auth: AuthService) {
  return {
    async list(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); const data = validate(backlogQuery.omit({ sprintId: true }), query); return repository.list(validate(idSchema, projectId), user.id, data.page); },
    async backlog(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); const data = validate(backlogQuery, query); return repository.backlog(validate(idSchema, projectId), user.id, data.page, data.sprintId); },
    async create(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); return repository.create(validate(idSchema, projectId), user.id, validate(sprintInput, input)); },
    async plan(token: string | undefined, projectId: unknown, id: unknown, input: unknown) { const user = await auth.me(token); return repository.plan(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(planningInput, input)); },
    async returnTask(token: string | undefined, projectId: unknown, id: unknown, taskId: unknown, input: unknown) { const user = await auth.me(token); return repository.returnTask(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(idSchema, taskId), validate(returnInput, input).updatedAt); },
  };
}
export type SprintService = ReturnType<typeof createSprintService>;
