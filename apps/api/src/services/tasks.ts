import type { TaskRepository } from '../repositories/tasks.js';
import type { AuthService } from './auth.js';
import { HttpError } from '../domain/errors.js';
import { validate } from './auth-validation.js';
import { idSchema } from './workspace-validation.js';
import { createTaskSchema, updateTaskSchema, assignTaskSchema, statusTaskSchema, taskQuerySchema } from './task-validation.js';
export function createTaskService(repository: TaskRepository, auth: AuthService) {
  return {
    async list(token: string | undefined, projectId: unknown, query: unknown) { const user = await auth.me(token); return repository.list(validate(idSchema, projectId), user.id, validate(taskQuerySchema, query)); },
    async myTasks(token: string | undefined, query: unknown) { const user = await auth.me(token); const data = validate(taskQuerySchema, query); if (data.assigneeId && data.assigneeId !== user.id) throw new HttpError(400, 'My Tasks chỉ hiển thị công việc giao cho bạn.'); return repository.myTasks(user.id, data); },
    async detail(token: string | undefined, id: unknown) { const user = await auth.me(token); return repository.detail(validate(idSchema, id), user.id); },
    async create(token: string | undefined, projectId: unknown, input: unknown) { const user = await auth.me(token); return repository.create(validate(idSchema, projectId), user.id, validate(createTaskSchema, input)); },
    async update(token: string | undefined, id: unknown, input: unknown) { const user = await auth.me(token); return repository.update(validate(idSchema, id), user.id, validate(updateTaskSchema, input)); },
    async assign(token: string | undefined, id: unknown, input: unknown) { const user = await auth.me(token); return repository.assign(validate(idSchema, id), user.id, validate(assignTaskSchema, input).assigneeId); },
    async status(token: string | undefined, id: unknown, input: unknown) { const user = await auth.me(token); return repository.status(validate(idSchema, id), user.id, validate(statusTaskSchema, input)); },
    async remove(token: string | undefined, id: unknown) { const user = await auth.me(token); return repository.remove(validate(idSchema, id), user.id); },
  };
}
export type TaskService = ReturnType<typeof createTaskService>;
