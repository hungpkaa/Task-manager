import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/repositories/database.js';
import { createWorkspaceRepository } from '../src/repositories/workspaces.js';
import { createAuthService, tokenHash } from '../src/services/auth.js';
import { createWorkspaceService, createNotificationService } from '../src/services/workspaces.js';
import type { Email } from '../src/services/email.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173';
async function fixture(run: (context: { base: string; client: PrismaClient; messages: Email[]; users: { id: string; email: string; cookie: string }[] }) => Promise<void>) {
  const url = readConfig().databaseUrl;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
  const database = createDatabase(url);
  const auth = createAuthService(database.accounts);
  const options = { appOrigin: origin, secureCookies: false };
  const messages: Email[] = [];
  const app = createApp(database, { ...options, service: auth }, { ...options,
    service: createWorkspaceService(database.workspaces, auth, { sender: { enabled: true, local: true, async send(message) { messages.push(message); } }, appOrigin: origin }), notifications: createNotificationService(database.notifications, auth),
  });
  const users: { id: string; email: string; cookie: string }[] = [];
  try {
    for (let index = 0; index < 4; index++) {
      const token = randomBytes(32).toString('base64url');
      const user = await client.user.create({ data: { email: `workspace-${randomUUID()}@example.invalid`, displayName: `Test ${index}`, passwordHash: 'fixture-only', systemRole: index === 3 ? 'SYSTEM_ADMIN' : 'MEMBER', sessions: { create: { tokenHash: tokenHash(token)!, expiresAt: new Date(Date.now() + 60_000) } } } });
      users.push({ id: user.id, email: user.email, cookie: `task_manager_session=${token}` });
    }
    await withHttp(app, (base) => run({ base, client, users, messages }));
  } finally {
    try {
      await client.workspace.deleteMany({ where: { createdBy: { in: users.map((user) => user.id) } } });
      await client.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    } finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}
function request(base: string, path: string, cookie?: string, method = 'GET', body?: unknown) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
}
test('Workspace invitation emails can be resent only by Owner and email failure preserves membership', async () => fixture(async ({ base, client, users, messages }) => {
  const [owner, member, outsider] = users; assert.ok(owner && member && outsider);
  const repo = createWorkspaceRepository(client); const workspace = await repo.create(owner.id, { name: 'Email invitation', description: '' });
  const path = `/workspaces/${workspace.id}/members`;
  const added = await request(base, path, owner.cookie, 'POST', { email: member.email }); assert.equal(added.status, 201);
  assert.equal((await added.json() as { member: { emailDelivery: string } }).member.emailDelivery, 'LOCAL');
  assert.equal(messages.length, 1); assert.equal(messages[0]!.to, member.email); assert.match(messages[0]!.text, /Email invitation/);
  assert.equal((await request(base, `${path}/${member.id}/email`, member.cookie, 'POST', {})).status, 403);
  assert.equal((await request(base, `${path}/${outsider.id}/email`, owner.cookie, 'POST', {})).status, 404);
  const resend = await request(base, `${path}/${member.id}/email`, owner.cookie, 'POST', {}); assert.deepEqual(await resend.json(), { delivery: 'LOCAL' }); assert.equal(messages.length, 2);
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id, userId: member.id } }), 1);
  assert.equal(await client.notification.count({ where: { userId: member.id, relatedEntityId: workspace.id } }), 1);
  const auth = createAuthService((await import('../src/repositories/accounts.js')).createAccountRepository(client));
  const failing = createWorkspaceService(repo, auth, { sender: { enabled: true, async send() { throw new Error('Injected email failure'); } }, appOrigin: origin });
  const result = await failing.invite(owner.cookie.split('=')[1], workspace.id, { email: outsider.email }); assert.equal(result.emailDelivery, 'FAILED');
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id, userId: outsider.id } }), 1);
  assert.equal(await client.notification.count({ where: { userId: outsider.id, relatedEntityId: workspace.id } }), 1);
  await client.user.update({ where: { id: member.id }, data: { status: 'LOCKED' } });
  assert.equal((await request(base, `${path}/${member.id}/email`, owner.cookie, 'POST', {})).status, 409);
}));

async function create(base: string, cookie: string) {
  const response = await request(base, '/workspaces', cookie, 'POST', { name: ' Nhóm kiểm thử ', description: ' Mô tả ' });
  assert.equal(response.status, 201);
  return (await response.json() as { workspace: { id: string; myRole: string; memberCount: number; name: string } }).workspace;
}

test('UC06–11: persisted workspace, owner permissions, memberships and private notifications', async () => fixture(async ({ base, client, users }) => {
  const [owner, member, outsider, admin] = users;
  assert.ok(owner && member && outsider && admin);
  assert.equal((await request(base, '/workspaces')).status, 401);
  const workspace = await create(base, owner.cookie);
  assert.equal(workspace.name, 'Nhóm kiểm thử'); assert.equal(workspace.myRole, 'OWNER'); assert.equal(workspace.memberCount, 1);
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id, userId: owner.id, role: 'OWNER' } }), 1);
  const path = `/workspaces/${workspace.id}`;
  assert.equal((await request(base, path, admin.cookie)).status, 403);
  assert.equal((await request(base, `${path}/members`, outsider.cookie)).status, 403);
  const invited = await request(base, `${path}/members`, owner.cookie, 'POST', { email: ` ${member.email.toUpperCase()} ` });
  assert.equal(invited.status, 201);
  assert.equal(JSON.stringify(await invited.json()).includes('passwordHash'), false);
  assert.equal((await request(base, `${path}/members`, owner.cookie, 'POST', { email: member.email })).status, 409);
  assert.equal(await client.notification.count({ where: { userId: member.id, relatedEntityId: workspace.id } }), 1);
  assert.equal((await request(base, path, member.cookie)).status, 200);
  assert.equal((await request(base, `${path}/members`, member.cookie)).status, 200);
  assert.equal((await request(base, path, member.cookie, 'PATCH', { name: 'Hacked' })).status, 403);
  assert.equal((await request(base, `${path}/members`, member.cookie, 'POST', { email: outsider.email })).status, 403);
  assert.equal((await request(base, `${path}/members/${owner.id}`, member.cookie, 'DELETE', {})).status, 403);
  assert.equal((await request(base, `${path}/members/${member.id}`, member.cookie, 'PATCH', { role: 'OWNER' })).status, 403);
  assert.equal((await request(base, path, owner.cookie, 'PATCH', { name: 'Tên mới' })).status, 200);
  assert.equal((await client.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name, 'Tên mới');
  const notifications = await (await request(base, '/notifications', member.cookie)).json() as { items: { id: string }[]; unreadCount: number };
  assert.equal(notifications.unreadCount, 1); assert.equal(notifications.items.length, 1);
  const notificationId = notifications.items[0]!.id;
  assert.equal((await request(base, `/notifications/${notificationId}/read`, outsider.cookie, 'PATCH', {})).status, 404);
  for (let index = 0; index < 2; index++) assert.equal((await request(base, `/notifications/${notificationId}/read`, member.cookie, 'PATCH', {})).status, 200);
  assert.equal((await (await request(base, '/notifications', member.cookie)).json() as { unreadCount: number }).unreadCount, 0);
  assert.equal((await (await request(base, '/notifications', owner.cookie)).json() as { items: unknown[] }).items.length, 0);
  assert.equal((await request(base, `${path}/members/${owner.id}`, owner.cookie, 'DELETE', {})).status, 409);
  assert.equal((await request(base, `${path}/members/${owner.id}`, owner.cookie, 'PATCH', { role: 'MEMBER' })).status, 409);
  assert.equal((await request(base, `${path}/members/${member.id}`, owner.cookie, 'PATCH', { role: 'OWNER' })).status, 200);
  assert.equal((await request(base, `${path}/members/${owner.id}`, owner.cookie, 'PATCH', { role: 'MEMBER' })).status, 200);
  assert.equal((await request(base, path, owner.cookie, 'PATCH', { name: 'Not allowed' })).status, 403);
  assert.equal((await request(base, `${path}/members/${owner.id}`, member.cookie, 'DELETE', {})).status, 204);
  assert.equal((await request(base, path, owner.cookie)).status, 403);
  assert.equal((await (await request(base, '/workspaces', owner.cookie)).json() as { workspaces: unknown[] }).workspaces.length, 0);
}));

test('invalid input, foreign origins, missing/locked invitees and cross-workspace targets are rejected', async () => fixture(async ({ base, client, users }) => {
  const [owner, member, outsider] = users; assert.ok(owner && member && outsider);
  for (const body of [{ name: ' ' }, { name: 'Valid', createdBy: outsider.id }, { name: 'x'.repeat(101) }]) assert.equal((await request(base, '/workspaces', owner.cookie, 'POST', body)).status, 400);
  assert.equal(await client.workspace.count({ where: { createdBy: owner.id } }), 0);
  const workspace = await create(base, owner.cookie); const path = `/workspaces/${workspace.id}`;
  assert.equal((await request(base, '/workspaces/not-a-uuid', owner.cookie)).status, 400);
  assert.equal((await request(base, `/workspaces/${randomUUID()}`, owner.cookie)).status, 404);
  assert.equal((await request(base, path, owner.cookie, 'PATCH', {})).status, 400);
  assert.equal((await request(base, `${path}/members`, owner.cookie, 'POST', { email: 'bad-email' })).status, 400);
  assert.equal((await request(base, `${path}/members`, owner.cookie, 'POST', { email: `${randomUUID()}@example.invalid` })).status, 404);
  await client.user.update({ where: { id: member.id }, data: { status: 'LOCKED' } });
  assert.equal((await request(base, `${path}/members`, owner.cookie, 'POST', { email: member.email })).status, 409);
  assert.equal((await request(base, `${path}/members/${owner.id}`, owner.cookie, 'PATCH', { role: 'SYSTEM_ADMIN' })).status, 400);
  await create(base, outsider.cookie);
  assert.equal((await request(base, `${path}/members/${outsider.id}`, owner.cookie, 'DELETE', {})).status, 404);
  assert.equal((await request(base, `${path}/members/${outsider.id}`, owner.cookie, 'PATCH', { role: 'OWNER' })).status, 404);
  const foreign = await fetch(`${base}/api${path}`, { method: 'PATCH', headers: { Origin: 'https://evil.example', Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hacked' }) });
  assert.equal(foreign.status, 403);
  assert.equal(await client.notification.count({ where: { relatedEntityId: workspace.id } }), 0);
}));

test('concurrent invitations and owner demotions cannot create duplicates or remove the last owner', async () => fixture(async ({ base, client, users }) => {
  const [owner, member] = users; assert.ok(owner && member);
  const workspace = await create(base, owner.cookie); const path = `/workspaces/${workspace.id}/members`;
  const invites = await Promise.all([request(base, path, owner.cookie, 'POST', { email: member.email }), request(base, path, owner.cookie, 'POST', { email: member.email })]);
  assert.deepEqual(invites.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await client.notification.count({ where: { relatedEntityId: workspace.id } }), 1);
  assert.equal((await request(base, `${path}/${member.id}`, owner.cookie, 'PATCH', { role: 'OWNER' })).status, 200);
  const results = await Promise.all([request(base, `${path}/${owner.id}`, owner.cookie, 'PATCH', { role: 'MEMBER' }), request(base, `${path}/${member.id}`, member.cookie, 'PATCH', { role: 'MEMBER' })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id, role: 'OWNER' } }), 1);
}));

// Inject a repository failure inside a real PostgreSQL transaction, without altering the database schema.
function failingClient(client: PrismaClient, model: 'workspaceMember' | 'notification') {
  return { $transaction: <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) => client.$transaction((transaction) => {
    const wrapped = new Proxy(transaction, { get(target, property) {
      if (property === model) return new Proxy(target[model], { get(delegate, operationName) {
        if (operationName === 'create') return async () => { throw new Error('Injected persistence failure'); };
        return Reflect.get(delegate, operationName);
      } });
      return Reflect.get(target, property);
    } });
    return operation(wrapped);
  }) } as unknown as PrismaClient;
}
test('failed owner membership or notification writes roll back the complete transaction', async () => fixture(async ({ client, users }) => {
  const [owner, member] = users; assert.ok(owner && member);
  const failingCreation = createWorkspaceRepository(failingClient(client, 'workspaceMember'));
  await assert.rejects(failingCreation.create(owner.id, { name: 'Must roll back', description: '' }), /Injected/);
  assert.equal(await client.workspace.count({ where: { createdBy: owner.id } }), 0);
  const workspace = await createWorkspaceRepository(client).create(owner.id, { name: 'Atomic invite', description: '' });
  await assert.rejects(createWorkspaceRepository(failingClient(client, 'notification')).invite(workspace.id, owner.id, member.email), /Injected/);
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id } }), 1);
  assert.equal(await client.notification.count({ where: { relatedEntityId: workspace.id } }), 0);
}));
