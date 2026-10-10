import { z } from 'zod';
import { HttpError } from '../domain/errors.js';

const email = z.string({ error: 'Vui lòng nhập email.' }).trim().toLowerCase()
  .max(254, 'Email quá dài.').pipe(z.email({ error: 'Email không hợp lệ.' }));
const displayName = z.string({ error: 'Vui lòng nhập tên hiển thị.' }).trim()
  .min(1, 'Tên hiển thị không được để trống.').max(100, 'Tên hiển thị tối đa 100 ký tự.');
const password = z.string({ error: 'Vui lòng nhập mật khẩu.' })
  .min(15, 'Mật khẩu cần ít nhất 15 ký tự.').max(128, 'Mật khẩu tối đa 128 ký tự.');

export const registrationSchema = z.object({ email, displayName, password }).strict();
// Older accounts can authenticate without imposing the current registration minimum.
export const loginSchema = z.object({ email, password: z.string({ error: 'Vui lòng nhập mật khẩu.' })
  .min(1, 'Vui lòng nhập mật khẩu.').max(128, 'Mật khẩu tối đa 128 ký tự.') }).strict();
export const profileSchema = z.object({ displayName }).strict();

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !fields[field]) fields[field] = issue.message;
  }
  throw new HttpError(400, 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.', fields);
}
