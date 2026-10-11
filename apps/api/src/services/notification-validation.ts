import { z } from 'zod';
export const notificationQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), status: z.enum(['all', 'unread']).default('all') }).strict();
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
