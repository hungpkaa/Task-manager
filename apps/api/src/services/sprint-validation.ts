import { z } from 'zod';
import { taskStatuses, taskPriorities } from './task-validation.js';
export const dailyInput = z.object({ progress: z.string().trim().min(1).max(2000), nextPlan: z.string().trim().min(1).max(2000), blockers: z.string().trim().max(2000).default('') }).strict();
export type DailyInput = z.infer<typeof dailyInput>;
export const reviewInput = z.object({ summary: z.string().trim().min(1).max(4000), feedback: z.string().trim().min(1).max(4000), expectedUpdatedAt: z.iso.datetime().nullable() }).strict();
export type ReviewInput = z.infer<typeof reviewInput>;
export const retrospectiveInput = z.object({ wentWell: z.string().trim().min(1).max(4000), needsImprovement: z.string().trim().min(1).max(4000), actionItems: z.string().trim().min(1).max(4000), expectedUpdatedAt: z.iso.datetime().nullable() }).strict();
export type RetrospectiveInput = z.infer<typeof retrospectiveInput>;
export const startInput = z.object({ expectedUpdatedAt: z.iso.datetime(), confirmed: z.boolean().default(false) }).strict();
export const monitorQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.enum(taskStatuses).optional(), priority: z.enum(taskPriorities).optional(),
  assigneeId: z.union([z.uuid(), z.literal('unassigned')]).optional(),
}).strict();
export type MonitorQuery = z.infer<typeof monitorQuery>;
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
