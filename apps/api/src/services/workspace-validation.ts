import { z } from 'zod';

const name = z.string({ error: 'Vui lòng nhập tên Workspace.' }).trim()
  .min(1, 'Tên Workspace không được để trống.').max(100, 'Tên Workspace tối đa 100 ký tự.');
const description = z.string().trim().max(1000, 'Mô tả tối đa 1000 ký tự.');
export const createWorkspaceSchema = z.object({ name, description: description.default('') }).strict();
export const updateWorkspaceSchema = z.object({ name: name.optional(), description: description.optional() }).strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, 'Cần ít nhất một thông tin để cập nhật.');
export const inviteMemberSchema = z.object({ email: z.string().trim().toLowerCase().max(254)
  .pipe(z.email({ error: 'Email không hợp lệ.' })) }).strict();
export const memberRoleSchema = z.object({ role: z.enum(['OWNER', 'MEMBER'], { error: 'Vai trò phải là Owner hoặc Member.' }) }).strict();
export const idSchema = z.uuid({ error: 'ID không hợp lệ.' });
