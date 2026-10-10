import { z } from 'zod';
export const sprintInput = z.object({
  name: z.string().trim().min(1).max(100), goal: z.string().trim().min(1).max(2000),
  startDate: z.iso.date(), endDate: z.iso.date(),
}).strict().refine((value) => value.endDate >= value.startDate, { path: ['endDate'], message: 'Ngày kết thúc Sprint không được trước ngày bắt đầu.' });
export const backlogQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), sprintId: z.uuid().optional() }).strict();
export const planningInput = z.object({
  tasks: z.array(z.object({ id: z.uuid(), updatedAt: z.iso.datetime() }).strict()).min(1).max(100),
  confirmed: z.boolean().default(false),
}).strict().refine((value) => new Set(value.tasks.map((task) => task.id)).size === value.tasks.length, 'Không chọn trùng Task.');
export const returnInput = z.object({ updatedAt: z.iso.datetime() }).strict();
export type SprintInput = z.infer<typeof sprintInput>;
export type PlanningInput = z.infer<typeof planningInput>;
