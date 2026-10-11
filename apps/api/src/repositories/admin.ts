import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError } from '../domain/errors.js';
import type { AdminUsersQuery, AdminWorkspacesQuery, AdminStatusInput } from '../services/admin-validation.js';

const userSelect = { id: true, email: true, displayName: true, systemRole: true, status: true, createdAt: true, updatedAt: true } as const;
async function authorize(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { status: true, systemRole: true } });
  if (!actor || actor.status !== 'ACTIVE' || actor.systemRole !== 'SYSTEM_ADMIN') throw new HttpError(403, 'Chỉ System Admin đang hoạt động được quản trị hệ thống.');
}
export function createAdminRepository(client: PrismaClient) {
  async function read<T>(actorId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return client.$transaction(async (tx) => { await authorize(tx, actorId); return operation(tx); }, { isolationLevel: 'RepeatableRead' });
  }
  return {
    users: (actorId: string, query: AdminUsersQuery) => read(actorId, async (tx) => {
      const where: Prisma.UserWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.q ? { OR: [{ email: { contains: query.q, mode: 'insensitive' } }, { displayName: { contains: query.q, mode: 'insensitive' } }] } : {}) };
      return { items: await tx.user.findMany({ where, select: userSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * 20, take: 20 }), total: await tx.user.count({ where }), page: query.page, pageSize: 20 };
    }),
    workspaces: (actorId: string, query: AdminWorkspacesQuery) => read(actorId, async (tx) => {
      const where: Prisma.WorkspaceWhereInput = query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {};
      return { items: await tx.workspace.findMany({ where, select: { id: true, name: true, createdAt: true, creator: { select: { id: true, email: true, displayName: true } }, _count: { select: { members: true, projects: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * 20, take: 20 }), total: await tx.workspace.count({ where }), page: query.page, pageSize: 20 };
    }),
    statistics: (actorId: string) => read(actorId, async (tx) => {
      const users = await tx.user.groupBy({ by: ['status'], _count: { _all: true } });
      const projects = await tx.project.groupBy({ by: ['status'], _count: { _all: true } });
      const tasks = await tx.task.groupBy({ by: ['status'], _count: { _all: true } });
      const sprints = await tx.sprint.groupBy({ by: ['status'], _count: { _all: true } });
      const counts = <T extends string>(states: readonly T[], groups: { status: T; _count: { _all: number } }[]) => Object.fromEntries(states.map((status) => [status, groups.find((item) => item.status === status)?._count._all ?? 0])) as Record<T, number>;
      return { generatedAt: new Date().toISOString(), users: counts(['ACTIVE', 'LOCKED'] as const, users), activeAdminCount: await tx.user.count({ where: { systemRole: 'SYSTEM_ADMIN', status: 'ACTIVE' } }), workspaceCount: await tx.workspace.count(), projects: counts(['ACTIVE', 'CLOSED'] as const, projects), tasks: counts(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const, tasks), sprints: counts(['PLANNED', 'ACTIVE', 'COMPLETED'] as const, sprints) };
    }),
    async changeStatus(actorId: string, userId: string, input: AdminStatusInput, sessionHash?: string) {
      return client.$transaction(async (tx) => {
        // Shared with bootstrap; status changes cannot remove every active admin concurrently.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(410043)::text`;
        if (sessionHash && !await tx.session.findFirst({ where: { tokenHash: sessionHash, userId: actorId, expiresAt: { gt: new Date() } } })) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        await authorize(tx, actorId);
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
        if (!user) throw new HttpError(404, 'Tài khoản không tồn tại.');
        if (user.status !== input.expectedStatus || user.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new HttpError(409, 'Tài khoản đã thay đổi. Tải lại danh sách trước khi xác nhận.');
        if (input.status === user.status) throw new HttpError(409, 'Tài khoản đã ở trạng thái này.');
        if (actorId === userId && input.status === 'LOCKED') throw new HttpError(409, 'Không thể tự khóa tài khoản quản trị đang sử dụng.');
        if (user.systemRole === 'SYSTEM_ADMIN' && input.status === 'LOCKED' && await tx.user.count({ where: { status: 'ACTIVE', systemRole: 'SYSTEM_ADMIN' } }) <= 1) throw new HttpError(409, 'Phải giữ ít nhất một System Admin đang hoạt động.');
        const updated = await tx.user.update({ where: { id: userId }, data: { status: input.status, updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) }, select: userSelect });
        if (input.status === 'LOCKED') { await tx.session.deleteMany({ where: { userId } }); await tx.passwordResetToken.deleteMany({ where: { userId } }); }
        return updated;
      });
    },
  };
}
export type AdminRepository = ReturnType<typeof createAdminRepository>;

// Operator-only initial provisioning; no HTTP route exposes role changes.
export async function bootstrapAdmin(client: PrismaClient, email: string, apply = false) {
  return client.$transaction(async (tx) => {
    if (apply) await tx.$queryRaw`SELECT pg_advisory_xact_lock(410043)::text`;
    if (await tx.user.count({ where: { systemRole: 'SYSTEM_ADMIN' } })) throw new HttpError(409, 'System Admin đã tồn tại; bootstrap chỉ dành cho tài khoản quản trị đầu tiên.');
    const user = await tx.user.findUnique({ where: { email }, select: userSelect });
    if (!user || user.status !== 'ACTIVE') throw new HttpError(400, 'Cần email của tài khoản đã đăng ký và đang ACTIVE.');
    if (!apply) return user;
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
    if (current.status !== 'ACTIVE') throw new HttpError(409, 'Tài khoản đã thay đổi; hãy kiểm tra lại.');
    return tx.user.update({ where: { id: user.id }, data: { systemRole: 'SYSTEM_ADMIN' }, select: userSelect });
  });
}
