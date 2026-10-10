import { z } from 'zod';

const name = z.string().trim().min(1, 'Nhập tên Project.').max(100, 'Tên tối đa 100 ký tự.');
const description = z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự.');
const date = z.iso.date('Ngày không hợp lệ, dùng YYYY-MM-DD.').nullable();
export const createProjectSchema = z.object({ name, description: description.default(''), startDate: date.default(null), endDate: date.default(null) }).strict()
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, { path: ['endDate'], message: 'Ngày kết thúc không được trước ngày bắt đầu.' });
export const updateProjectSchema = z.object({ name: name.optional(), description: description.optional(), startDate: date.optional(), endDate: date.optional() }).strict()
  .refine((data) => Object.keys(data).length > 0, 'Cần có thông tin để cập nhật.');
export const managerSchema = z.object({ managerUserId: z.uuid(), expectedManagerUserId: z.uuid().nullable() }).strict();
export const projectMemberSchema = z.object({ userId: z.uuid() }).strict();
export type ProjectInput = { name?: string; description?: string; startDate?: string | null; endDate?: string | null };
