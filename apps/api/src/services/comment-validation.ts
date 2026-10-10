import { z } from 'zod';
export const commentSchema = z.object({ body: z.string().trim().min(1, 'Nhập bình luận.').max(5000, 'Bình luận tối đa 5000 ký tự.') }).strict();
export const commentQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
// An explicit delimiter avoids ambiguity with prose and punctuation after an email.
export function mentionEmails(body: string) {
  return [...new Set(Array.from(body.matchAll(/@\{([^{}\s]+)\}/g), (match) => match[1]!.toLowerCase()))];
}
