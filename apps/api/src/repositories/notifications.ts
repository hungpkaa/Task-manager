import type { PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';
import type { NotificationQuery } from '../services/notification-validation.js';

export function createNotificationRepository(client: PrismaClient) {
  return {
    async list(userId: string, query: NotificationQuery = { page: 1, status: 'all' }) {
      return client.$transaction(async (tx) => {
        const where = { userId, ...(query.status === 'unread' ? { readAt: null } : {}) };
        return { items: await tx.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * 50, take: 50 }),
          unreadCount: await tx.notification.count({ where: { userId, readAt: null } }), total: await tx.notification.count({ where }), page: query.page, pageSize: 50 };
      }, { isolationLevel: 'RepeatableRead' });
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
