import type { SprintRepository } from '../repositories/sprints.js';
import type { AuthService } from './auth.js';
import { validate } from './auth-validation.js';
import { idSchema } from './workspace-validation.js';
import { retrospectiveInput, reviewInput, backlogQuery, planningInput, returnInput, sprintInput, startInput, monitorQuery, dailyInput } from './sprint-validation.js';
export function createSprintService(repository: SprintRepository, auth: AuthService) {
  return {
    async retrospective(token: string | undefined, projectId: unknown, id: unknown) { const user = await auth.me(token); return repository.retrospective(validate(idSchema, projectId), user.id, validate(idSchema, id)); },
    async saveRetrospective(token: string | undefined, projectId: unknown, id: unknown, input: unknown) { const user = await auth.me(token); return repository.saveRetrospective(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(retrospectiveInput, input)); },
    async review(token: string | undefined, projectId: unknown, id: unknown) { const user = await auth.me(token); return repository.review(validate(idSchema, projectId), user.id, validate(idSchema, id)); },
    async saveReview(token: string | undefined, projectId: unknown, id: unknown, input: unknown) { const user = await auth.me(token); return repository.saveReview(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(reviewInput, input)); },
    async daily(token: string | undefined, projectId: unknown, id: unknown, query: unknown) { const user = await auth.me(token); return repository.daily(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(backlogQuery.omit({ sprintId: true }), query).page); },
    async addDaily(token: string | undefined, projectId: unknown, id: unknown, input: unknown) { const user = await auth.me(token); return repository.addDaily(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(dailyInput, input)); },
    async start(token: string | undefined, projectId: unknown, id: unknown, input: unknown) { const user = await auth.me(token); const data = validate(startInput, input); return repository.start(validate(idSchema, projectId), user.id, validate(idSchema, id), data.expectedUpdatedAt, data.confirmed); },
    async monitor(token: string | undefined, projectId: unknown, id: unknown, query: unknown) { const user = await auth.me(token); return repository.monitor(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(monitorQuery, query)); },
    async list(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); const data = validate(backlogQuery.omit({ sprintId: true }), query); return repository.list(validate(idSchema, projectId), user.id, data.page); },
    async backlog(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); const data = validate(backlogQuery, query); return repository.backlog(validate(idSchema, projectId), user.id, data.page, data.sprintId); },
    async create(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); return repository.create(validate(idSchema, projectId), user.id, validate(sprintInput, input)); },
    async plan(token: string | undefined, projectId: unknown, id: unknown, input: unknown) { const user = await auth.me(token); return repository.plan(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(planningInput, input)); },
    async returnTask(token: string | undefined, projectId: unknown, id: unknown, taskId: unknown, input: unknown) { const user = await auth.me(token); return repository.returnTask(validate(idSchema, projectId), user.id, validate(idSchema, id), validate(idSchema, taskId), validate(returnInput, input).updatedAt); },
  };
}
export type SprintService = ReturnType<typeof createSprintService>;
