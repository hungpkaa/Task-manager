import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createDatabase } from '../src/repositories/database.js';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createAuthService, tokenHash } from '../src/services/auth.js';
import { createAdminService } from '../src/services/admin.js';
import { createAccountRepository } from '../src/repositories/accounts.js';
import { createWorkspaceService, createNotificationService } from '../src/services/workspaces.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173'; const password = 'admin integration passphrase';
async function fixture(run: (context: { base: string; client: PrismaClient; database: ReturnType<typeof createDatabase>; users: { id: string; email: string; cookie: string }[]; prefix: string }) => Promise<void>) {
  const database = createDatabase(readConfig().databaseUrl); const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: readConfig().databaseUrl }) });
  const auth = createAuthService(database.accounts); const options = { appOrigin: origin, secureCookies: false };
  const app = createApp(database, { ...options, service: auth }, { ...options, service: createWorkspaceService(database.workspaces, auth), notifications: createNotificationService(database.notifications, auth) }, undefined, undefined, undefined, { ...options, service: createAdminService(database.admin, auth) });
  const users: { id: string; email: string; cookie: string }[] = []; const prefix = `admin-${randomUUID()}`;
  try {
    for (let index = 0; index < 4; index++) { const result = await auth.register({ email: `${prefix}-${index}@example.invalid`, displayName: `${prefix} user ${index}`, password }); users.push({ id: result.user.id, email: result.user.email, cookie: `task_manager_session=${result.token}` }); }
    await client.user.update({ where: { id: users[0]!.id }, data: { systemRole: 'SYSTEM_ADMIN' } });
    await client.user.update({ where: { id: users[1]!.id }, data: { systemRole: 'SYSTEM_ADMIN' } });
    await withHttp(app, (base) => run({ base, client, database, users, prefix }));
  } finally {
    try { await client.project.deleteMany({ where: { workspace: { createdBy: { in: users.map((user) => user.id) } } } }); await client.workspace.deleteMany({ where: { createdBy: { in: users.map((user) => user.id) } } }); await client.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } }); }
    finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}
function request(base: string, path: string, cookie?: string, method = 'GET', body?: unknown, requestOrigin = origin) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function input(client: PrismaClient, id: string, status: 'ACTIVE' | 'LOCKED') { const user = await client.user.findUniqueOrThrow({ where: { id } }); return { status, expectedStatus: user.status, expectedUpdatedAt: user.updatedAt.toISOString() }; }

test('UC40–43: admin scope, safe metadata, search, pagination and global statistics', async () => fixture(async ({ base, client, database, users, prefix }) => {
  const [admin, , member] = users; assert.ok(admin && member);
  for (const path of ['/admin/users', '/admin/workspaces', '/admin/statistics']) { assert.equal((await request(base, path)).status, 401); assert.equal((await request(base, path, member.cookie)).status, 403); assert.equal((await request(base, path, admin.cookie)).status, 200); }
  for (const path of ['/admin/users?page=0', '/admin/users?status=BAD', '/admin/users?extra=true', '/admin/workspaces?page=1.5', '/admin/statistics?q=test']) assert.equal((await request(base, path, admin.cookie)).status, 400);
  const list = await (await request(base, `/admin/users?q=${prefix}`, admin.cookie)).json(); assert.equal(list.total, 4);
  for (const user of list.items) { assert.equal('passwordHash' in user, false); assert.equal('sessions' in user, false); }
  const own = await database.workspaces.create(member.id, { name: `${prefix} Workspace`, description: 'private text' });
  const project = await client.project.create({ data: { workspaceId: own.id, name: 'Private Project' } });
  await client.task.create({ data: { projectId: project.id, title: 'Private Task', status: 'DONE' } });
  const workspaces = await (await request(base, `/admin/workspaces?q=${prefix}`, admin.cookie)).json(); assert.equal(workspaces.total, 1); assert.equal(workspaces.items[0]._count.projects, 1); assert.equal('description' in workspaces.items[0], false);
  assert.equal((await request(base, `/workspaces/${own.id}`, admin.cookie)).status, 403);
  const stats = await (await request(base, '/admin/statistics', admin.cookie)).json(); assert.ok(stats.users.ACTIVE >= 4); assert.ok(stats.activeAdminCount >= 2); assert.ok(stats.workspaceCount >= 1); assert.ok(stats.tasks.DONE >= 1);
  for (let index = 0; index < 21; index++) { const user = await client.user.create({ data: { email: `${prefix}-extra-${index}@example.invalid`, displayName: prefix, passwordHash: 'fixture-only' } }); users.push({ id: user.id, email: user.email, cookie: '' }); await database.workspaces.create(user.id, { name: `${prefix} extra ${index}`, description: '' }); }
  const second = await (await request(base, `/admin/users?q=${prefix}&page=2`, admin.cookie)).json(); assert.equal(second.total, 25); assert.equal(second.items.length, 5);
  const workspacePage = await (await request(base, `/admin/workspaces?q=${prefix}&page=2`, admin.cookie)).json(); assert.equal(workspacePage.total, 22); assert.equal(workspacePage.items.length, 2);
}));

test('UC41: confirmation versions, session revocation, unlock, login races and concurrent admin locks', async () => fixture(async ({ base, client, users }) => {
  const [admin, otherAdmin, member] = users; assert.ok(admin && otherAdmin && member); const path = `/admin/users/${member.id}/status`;
  assert.equal((await request(base, path, member.cookie, 'PATCH', await input(client, member.id, 'LOCKED'))).status, 403);
  assert.equal((await request(base, path, admin.cookie, 'PATCH', await input(client, member.id, 'LOCKED'), 'https://foreign.invalid')).status, 403);
  assert.equal((await request(base, path, admin.cookie, 'PATCH')).status, 415);
  assert.equal((await request(base, path, admin.cookie, 'PATCH', { status: 'LOCKED' })).status, 400);
  assert.equal((await request(base, `/admin/users/${admin.id}/status`, admin.cookie, 'PATCH', await input(client, admin.id, 'LOCKED'))).status, 409);
  await client.passwordResetToken.create({ data: { userId: member.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000) } });
  const stale = await input(client, member.id, 'LOCKED'); await client.user.update({ where: { id: member.id }, data: { displayName: 'Updated user', updatedAt: new Date(Date.now() + 1000) } });
  assert.equal((await request(base, path, admin.cookie, 'PATCH', stale)).status, 409);
  const current = await input(client, member.id, 'LOCKED');
  const locked = await Promise.all([request(base, path, admin.cookie, 'PATCH', current), request(base, path, otherAdmin.cookie, 'PATCH', current)]); assert.deepEqual(locked.map((response) => response.status).sort(), [200, 409]);
  assert.equal(await client.session.count({ where: { userId: member.id } }), 0); assert.equal(await client.passwordResetToken.count({ where: { userId: member.id } }), 0);
  assert.equal((await request(base, '/auth/me', member.cookie)).status, 401);
  assert.equal((await request(base, '/auth/login', undefined, 'POST', { email: member.email, password })).status, 403);
  const filtered = await (await request(base, `/admin/users?q=${member.email}&status=LOCKED`, admin.cookie)).json(); assert.equal(filtered.total, 1);
  assert.equal((await request(base, path, admin.cookie, 'PATCH', await input(client, member.id, 'ACTIVE'))).status, 200);
  assert.equal((await request(base, '/auth/me', member.cookie)).status, 401); assert.equal((await request(base, '/auth/login', undefined, 'POST', { email: member.email, password })).status, 200);
  const sessionHash = tokenHash(randomBytes(32).toString('base64url'))!; const accounts = createAccountRepository(client);
  await Promise.allSettled([request(base, path, admin.cookie, 'PATCH', await input(client, member.id, 'LOCKED')), accounts.createSession(member.id, sessionHash, new Date(Date.now() + 60000))]);
  assert.equal((await client.user.findUniqueOrThrow({ where: { id: member.id } })).status, 'LOCKED'); assert.equal(await client.session.count({ where: { userId: member.id } }), 0);
  const races = await Promise.all([request(base, `/admin/users/${otherAdmin.id}/status`, admin.cookie, 'PATCH', await input(client, otherAdmin.id, 'LOCKED')), request(base, `/admin/users/${admin.id}/status`, otherAdmin.cookie, 'PATCH', await input(client, admin.id, 'LOCKED'))]);
  assert.equal(races.filter((response) => response.status === 200).length, 1); assert.ok(races.some((response) => [401, 403].includes(response.status)));
  assert.equal(await client.user.count({ where: { id: { in: [admin.id, otherAdmin.id] }, status: 'ACTIVE' } }), 1);
}));
