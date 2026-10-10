import type { PrismaClient } from '../generated/prisma/client.js';

export function createPasswordResetRepository(client: PrismaClient) {
  return {
    async issue(email: string, tokenHash: string, expiresAt: Date) {
      const found = await client.user.findUnique({ where: { email }, select: { id: true } });
      if (!found) return null;
      return client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${found.id}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: found.id } });
        if (!user || user.status !== 'ACTIVE') return null;
        const recent = await tx.passwordResetToken.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
        if (recent) return null;
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
        return { id: user.id, email: user.email };
      });
    },
    async discard(tokenHash: string) { await client.passwordResetToken.deleteMany({ where: { tokenHash } }); },
    async consume(tokenHash: string, passwordHash: string) {
      const found = await client.passwordResetToken.findUnique({ where: { tokenHash }, select: { userId: true } });
      if (!found) return false;
      return client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${found.userId}::uuid FOR UPDATE`;
        const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
        if (!reset || reset.expiresAt <= new Date() || reset.user.status !== 'ACTIVE') return false;
        await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: reset.userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId } });
        return true;
      });
    },
  };
}
export type PasswordResetRepository = ReturnType<typeof createPasswordResetRepository>;
