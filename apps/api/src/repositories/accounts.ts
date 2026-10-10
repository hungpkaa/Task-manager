import type { PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';

export interface AccountRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  systemRole: 'MEMBER' | 'SYSTEM_ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
  register(data: { email: string; displayName: string; passwordHash: string }, tokenHash: string, expiresAt: Date, previousHash?: string): Promise<AccountRecord>;
  createSession(userId: string, tokenHash: string, expiresAt: Date, previousHash?: string, expectedPasswordHash?: string): Promise<void>;
  findSession(tokenHash: string): Promise<{ expiresAt: Date; user: AccountRecord } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  updateProfile(id: string, displayName: string): Promise<AccountRecord>;
}

export function createAccountRepository(client: PrismaClient): AccountRepository {
  return {
    findByEmail: (email) => client.user.findUnique({ where: { email } }),
    register: (data, tokenHash, expiresAt, previousHash) => client.$transaction(async (transaction) => {
      const user = await transaction.user.create({ data });
      await transaction.session.create({ data: { userId: user.id, tokenHash, expiresAt } });
      if (previousHash) await transaction.session.deleteMany({ where: { tokenHash: previousHash } });
      return user;
    }),
    async createSession(userId, tokenHash, expiresAt, previousHash, expectedPasswordHash) {
      await client.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const user = await transaction.user.findUnique({ where: { id: userId } });
        if (!user || user.status !== 'ACTIVE' || expectedPasswordHash && user.passwordHash !== expectedPasswordHash) throw new HttpError(401, 'Thông tin đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
        await transaction.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
        if (previousHash) await transaction.session.deleteMany({ where: { tokenHash: previousHash } });
        await transaction.session.create({ data: { userId, tokenHash, expiresAt } });
      });
    },
    findSession: (tokenHash) => client.session.findUnique({ where: { tokenHash }, include: { user: true } }),
    async deleteSession(tokenHash) { await client.session.deleteMany({ where: { tokenHash } }); },
    updateProfile: (id, displayName) => client.user.update({ where: { id }, data: { displayName } }),
  };
}
