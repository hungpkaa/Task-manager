import { z } from 'zod';
export const taskStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
export const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const title = z.string().trim().min(1, 'Nhập tiêu đề công việc.').max(200, 'Tiêu đề tối đa 200 ký tự.');
const description = z.string().trim().max(10000, 'Mô tả tối đa 10000 ký tự.');
const date = z.iso.date('Ngày phải hợp lệ và có dạng YYYY-MM-DD.').nullable();
const effort = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)]).nullable();
const fields = { title, description, priority: z.enum(taskPriorities), startDate: date, dueDate: date, effort };
export const createTaskSchema = z.object({ ...fields, description: description.default(''), priority: fields.priority.default('MEDIUM'), startDate: date.default(null), dueDate: date.default(null), effort: effort.default(null), assigneeId: z.uuid().nullable().optional(), assigneeIds: z.array(z.uuid()).optional(), sprintId: z.uuid().nullable().optional() }).strict()
  .refine((input) => !input.startDate || !input.dueDate || input.dueDate >= input.startDate, { path: ['dueDate'], message: 'Deadline không được trước ngày bắt đầu.' });
export const updateTaskSchema = z.object(fields).partial().strict().refine((input) => Object.keys(input).length > 0, 'Cần có dữ liệu để cập nhật.');
export const assignTaskSchema = z.object({ assigneeId: z.uuid().nullable().optional(), assigneeIds: z.array(z.uuid()).optional() }).strict().refine((data) => data.assigneeId !== undefined || data.assigneeIds !== undefined, { message: 'Cần chỉ định người phụ trách hoặc danh sách người phụ trách.' });
export const dependencySchema = z.object({ dependsOnTaskId: z.uuid() }).strict();
export const statusTaskSchema = z.object({ status: z.enum(taskStatuses), expectedStatus: z.enum(taskStatuses), acknowledgeBlocked: z.boolean().default(false) }).strict();
export const taskQuerySchema = z.object({
  q: z.string().trim().max(200).optional(), status: z.enum(taskStatuses).optional(), priority: z.enum(taskPriorities).optional(),
  assigneeId: z.union([z.uuid(), z.literal('unassigned')]).optional(),
  sort: z.enum(['updatedAt', 'title', 'dueDate', 'priority']).default('updatedAt'), direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
export type StatusTaskInput = z.infer<typeof statusTaskSchema>;
