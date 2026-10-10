import type { PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';

export function createNotificationRepository(client: PrismaClient) {
  return {
    async list(userId: string) {
      const [items, unreadCount] = await client.$transaction([
        client.notification.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
        client.notification.count({ where: { userId, readAt: null } }),
      ]);
      return { items, unreadCount };
    },
    async markRead(id: string, userId: string) {
      const result = await client.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
      const notification = await client.notification.findFirst({ where: { id, userId } });
      if (!notification && result.count === 0) throw new HttpError(404, 'Thông báo không tồn tại.');
      return notification;
    },
  };
}

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;
