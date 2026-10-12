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
import { createProjectService } from '../src/services/projects.js';
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
  }, { ...options, service: createProjectService(database.projects, auth) });
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
      const workspaces = await client.workspace.findMany({ where: { createdBy: { in: users.map((user) => user.id) } }, select: { id: true } });
      await client.project.deleteMany({ where: { workspaceId: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.workspaceInvitation.deleteMany({ where: { workspaceId: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    } finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}
function request(base: string, path: string, cookie?: string, method = 'GET', body?: unknown) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
}
test('UC32: notification history pagination, unread filter, stable order and privacy', async () => fixture(async ({ base, client, users }) => {
  const [owner, member, outsider] = users; assert.ok(owner && member && outsider);
  await client.notification.createMany({ data: Array.from({ length: 61 }, (_, index) => ({ userId: member.id, type: 'TASK_ASSIGNED', title: `History ${index}`, message: 'History', relatedEntityType: 'TASK', relatedEntityId: randomUUID(), createdAt: new Date('2026-10-11T00:00:00Z'), readAt: index < 10 ? new Date('2026-10-11T01:00:00Z') : null })) });
  await client.notification.create({ data: { userId: outsider.id, type: 'TASK_ASSIGNED', title: 'Private foreign', message: 'Foreign', relatedEntityType: 'TASK', relatedEntityId: randomUUID() } });
  assert.equal((await request(base, '/notifications')).status, 401);
  for (const suffix of ['page=0', 'page=1.5', 'status=bad', 'userId=other', 'page=100001']) assert.equal((await request(base, `/notifications?${suffix}`, member.cookie)).status, 400);
  const first = await (await request(base, '/notifications', member.cookie)).json(); const second = await (await request(base, '/notifications?page=2', member.cookie)).json();
  assert.equal(first.total, 61); assert.equal(first.unreadCount, 51); assert.equal(first.items.length, 50); assert.equal(second.items.length, 11);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 61);
  const unread = await (await request(base, '/notifications?status=unread&page=2', member.cookie)).json(); assert.equal(unread.total, 51); assert.equal(unread.items.length, 1); assert.equal(unread.items[0].readAt, null);
  const oldId = unread.items[0].id;
  assert.equal((await request(base, `/notifications/${oldId}/read`, owner.cookie, 'PATCH', {})).status, 404);
  for (let index = 0; index < 2; index++) assert.equal((await request(base, `/notifications/${oldId}/read`, member.cookie, 'PATCH', {})).status, 200);
  const filtered = await (await request(base, '/notifications?status=unread&page=2', member.cookie)).json(); assert.equal(filtered.total, 50); assert.equal(filtered.unreadCount, 50); assert.equal(filtered.items.length, 0);
  assert.equal((await (await request(base, '/notifications', owner.cookie)).json()).total, 0);
}));

test('Workspace invitation emails can be resent only by Owner and email failure preserves membership', async () => fixture(async ({ base, client, users, messages }) => {
  const [owner, member, outsider] = users; assert.ok(owner && member && outsider);
  const repo = createWorkspaceRepository(client); const workspace = await repo.create(owner.id, { name: 'Email invitation', description: '' });
  const path = `/workspaces/${workspace.id}/members`;
  const added = await request(base, path, owner.cookie, 'POST', { email: member.email }); assert.equal(added.status, 201);
  const addedData = await added.json() as { member: { id: string; emailDelivery: string } };
  assert.equal(addedData.member.emailDelivery, 'LOCAL');
  assert.equal(messages.length, 1); assert.equal(messages[0]!.to, member.email); assert.match(messages[0]!.text, /Email invitation/);
  assert.equal((await request(base, `${path}/${member.id}/email`, member.cookie, 'POST', {})).status, 403);
  assert.equal((await request(base, `${path}/${outsider.id}/email`, owner.cookie, 'POST', {})).status, 404);
  const resend = await request(base, `${path}/${member.id}/email`, owner.cookie, 'POST', {}); assert.deepEqual(await resend.json(), { delivery: 'LOCAL' }); assert.equal(messages.length, 2);
  assert.equal(await client.workspaceInvitation.count({ where: { workspaceId: workspace.id, inviteeId: member.id, status: 'PENDING' } }), 1);
  assert.equal(await client.notification.count({ where: { userId: member.id, relatedEntityId: addedData.member.id } }), 2);
  const auth = createAuthService((await import('../src/repositories/accounts.js')).createAccountRepository(client));
  const failing = createWorkspaceService(repo, auth, { sender: { enabled: true, async send() { throw new Error('Injected email failure'); } }, appOrigin: origin });
  const result = await failing.invite(owner.cookie.split('=')[1], workspace.id, { email: outsider.email }); assert.equal(result.emailDelivery, 'FAILED');
  assert.equal(await client.workspaceInvitation.count({ where: { workspaceId: workspace.id, inviteeId: outsider.id, status: 'PENDING' } }), 1);
  assert.equal(await client.notification.count({ where: { userId: outsider.id, relatedEntityId: result.id } }), 1);
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
  assert.equal(await client.notification.count({ where: { userId: member.id, type: 'WORKSPACE_INVITATION' } }), 1);
  // Member has not accepted yet: cannot access workspace
  assert.equal((await request(base, path, member.cookie)).status, 403);
  // Member accepts invitation
  const myInv = await (await request(base, '/workspaces/invitations/me', member.cookie)).json() as { invitations: { id: string }[] };
  assert.equal(myInv.invitations.length, 1);
  assert.equal((await request(base, `/workspaces/invitations/${myInv.invitations[0]!.id}/accept`, member.cookie, 'POST', {})).status, 200);
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
  assert.equal((await (await request(base, '/notifications', owner.cookie)).json() as { items: unknown[] }).items.length, 1);
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
  const myInv = await (await request(base, '/workspaces/invitations/me', member.cookie)).json() as { invitations: { id: string }[] };
  await request(base, `/workspaces/invitations/${myInv.invitations[0]!.id}/accept`, member.cookie, 'POST', {});
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
  assert.equal(await client.workspaceInvitation.count({ where: { workspaceId: workspace.id } }), 0);
  assert.equal(await client.notification.count({ where: { relatedEntityId: workspace.id } }), 0);
}));

test('closing workspace requires Owner and no active projects; blocks operations; reopen restores activity', async () => fixture(async ({ base, client, users }) => {
  const [owner, member, outsider, admin] = users;
  assert.ok(owner && member && outsider && admin);

  const workspace = await create(base, owner.cookie);
  const path = `/workspaces/${workspace.id}`;

  // Member joins workspace via invite and accept
  await request(base, `${path}/members`, owner.cookie, 'POST', { email: member.email });
  const myInv = await (await request(base, '/workspaces/invitations/me', member.cookie)).json() as { invitations: { id: string }[] };
  await request(base, `/workspaces/invitations/${myInv.invitations[0]!.id}/accept`, member.cookie, 'POST', {});

  // Only Owner can close workspace
  assert.equal((await request(base, `${path}/close`, member.cookie, 'POST', {})).status, 403);
  assert.equal((await request(base, `${path}/close`, outsider.cookie, 'POST', {})).status, 403);
  assert.equal((await request(base, `${path}/close`, admin.cookie, 'POST', {})).status, 403);

  // Create an active project in the workspace
  const projRes = await request(base, `${path}/projects`, owner.cookie, 'POST', {
    name: 'Active Project',
    description: 'Testing close',
    startDate: '2026-10-10',
    endDate: '2026-11-10',
  });
  assert.equal(projRes.status, 201);
  const project = (await projRes.json() as { project: { id: string } }).project;
  // Assign member as PM
  const assignRes = await request(base, `/projects/${project.id}/manager`, owner.cookie, 'PATCH', {
    managerUserId: member.id,
    expectedManagerUserId: null,
  });
  assert.equal(assignRes.status, 200);

  // Cannot close workspace while active project exists
  const blockedClose = await request(base, `${path}/close`, owner.cookie, 'POST', {});
  assert.equal(blockedClose.status, 409);
  assert.match((await blockedClose.json() as { message: string }).message, /đang hoạt động/);

  // Close the project first (by PM)
  const closeProjRes = await request(base, `/projects/${project.id}/close`, member.cookie, 'POST', {});
  assert.equal(closeProjRes.status, 200);

  // Now Owner can close the workspace
  const closeWsRes = await request(base, `${path}/close`, owner.cookie, 'POST', {});
  assert.equal(closeWsRes.status, 200);
  const closedData = (await closeWsRes.json() as { workspace: { status: string; closedAt: string | null } }).workspace;
  assert.equal(closedData.status, 'CLOSED');
  assert.ok(closedData.closedAt);

  // DB reflects CLOSED status
  const inDb = await client.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
  assert.equal(inDb.status, 'CLOSED');
  assert.ok(inDb.closedAt);

  // Notification is sent to member
  const memberNotifs = await (await request(base, '/notifications', member.cookie)).json() as { items: { type: string; title: string }[] };
  assert.ok(memberNotifs.items.some((item) => item.type === 'WORKSPACE_CLOSED'));

  // Idempotent close
  assert.equal((await request(base, `${path}/close`, owner.cookie, 'POST', {})).status, 200);

  // Blocked operations on CLOSED workspace:
  // 1. Cannot create project
  const createProjBlocked = await request(base, `${path}/projects`, owner.cookie, 'POST', {
    name: 'New Project',
    startDate: '2026-10-10',
    endDate: '2026-11-10',
  });
  assert.equal(createProjBlocked.status, 409);

  // 2. Cannot edit workspace
  assert.equal((await request(base, path, owner.cookie, 'PATCH', { name: 'New Name' })).status, 409);

  // 3. Cannot invite members
  assert.equal((await request(base, `${path}/members`, owner.cookie, 'POST', { email: outsider.email })).status, 409);

  // 4. Cannot remove member
  assert.equal((await request(base, `${path}/members/${member.id}`, owner.cookie, 'DELETE', {})).status, 409);

  // 5. Cannot change role
  assert.equal((await request(base, `${path}/members/${member.id}`, owner.cookie, 'PATCH', { role: 'OWNER' })).status, 409);

  // Reopen workspace: Member cannot reopen
  assert.equal((await request(base, `${path}/reopen`, member.cookie, 'POST', {})).status, 403);

  // Owner reopens workspace
  const reopenRes = await request(base, `${path}/reopen`, owner.cookie, 'POST', {});
  assert.equal(reopenRes.status, 200);
  const reopenedData = (await reopenRes.json() as { workspace: { status: string; closedAt: string | null } }).workspace;
  assert.equal(reopenedData.status, 'ACTIVE');
  assert.equal(reopenedData.closedAt, null);

  // DB reflects ACTIVE
  const restoredDb = await client.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
  assert.equal(restoredDb.status, 'ACTIVE');
  assert.equal(restoredDb.closedAt, null);

  // Notification sent for reopen
  const memberReopenNotifs = await (await request(base, '/notifications', member.cookie)).json() as { items: { type: string }[] };
  assert.ok(memberReopenNotifs.items.some((item) => item.type === 'WORKSPACE_REOPENED'));

  // Now operations are allowed again
  assert.equal((await request(base, path, owner.cookie, 'PATCH', { name: 'Reopened Workspace' })).status, 200);
  const createdAfterReopen = await request(base, `${path}/projects`, owner.cookie, 'POST', {
    name: 'Project After Reopen',
    startDate: '2026-10-10',
    endDate: '2026-11-10',
  });
  assert.equal(createdAfterReopen.status, 201);
}));

test('workspace invitation workflow: pending list, resend, cancel, decline, and accept', async () => fixture(async ({ base, client, users }) => {
  const [owner, member, outsider] = users; assert.ok(owner && member && outsider);
  const workspace = await create(base, owner.cookie);
  const path = `/workspaces/${workspace.id}`;

  // 1. Owner invites member
  const inviteRes = await request(base, `${path}/invitations`, owner.cookie, 'POST', { email: member.email });
  assert.equal(inviteRes.status, 201);
  const invId = (await inviteRes.json() as { invitation: { id: string; status: string } }).invitation.id;

  // 2. Owner lists pending invitations
  const pendingList = await (await request(base, `${path}/invitations`, owner.cookie)).json() as { invitations: { id: string; invitee: { email: string } }[] };
  assert.equal(pendingList.invitations.length, 1);
  assert.equal(pendingList.invitations[0]!.id, invId);
  assert.equal(pendingList.invitations[0]!.invitee.email, member.email);

  // 3. Owner resends invitation
  const resendRes = await request(base, `${path}/invitations/${invId}/resend`, owner.cookie, 'POST', {});
  assert.equal(resendRes.status, 200);

  // 4. Outsider cannot accept or decline member's invitation
  assert.equal((await request(base, `/workspaces/invitations/${invId}/accept`, outsider.cookie, 'POST', {})).status, 404);
  assert.equal((await request(base, `/workspaces/invitations/${invId}/decline`, outsider.cookie, 'POST', {})).status, 404);

  // 5. Member declines invitation
  const declineRes = await request(base, `/workspaces/invitations/${invId}/decline`, member.cookie, 'POST', {});
  assert.equal(declineRes.status, 200);
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id, userId: member.id } }), 0);

  // 6. Owner re-invites member
  const reInviteRes = await request(base, `${path}/invitations`, owner.cookie, 'POST', { email: member.email });
  assert.equal(reInviteRes.status, 201);
  const newInvId = (await reInviteRes.json() as { invitation: { id: string } }).invitation.id;

  // 7. Owner cancels invitation
  const cancelRes = await request(base, `${path}/invitations/${newInvId}`, owner.cookie, 'DELETE', {});
  assert.equal(cancelRes.status, 204);

  // 8. Owner invites again and Member accepts
  await request(base, `${path}/invitations`, owner.cookie, 'POST', { email: member.email });
  const myInv = await (await request(base, '/workspaces/invitations/me', member.cookie)).json() as { invitations: { id: string }[] };
  assert.equal(myInv.invitations.length, 1);
  const acceptRes = await request(base, `/workspaces/invitations/${myInv.invitations[0]!.id}/accept`, member.cookie, 'POST', {});
  assert.equal(acceptRes.status, 200);
  assert.equal(await client.workspaceMember.count({ where: { workspaceId: workspace.id, userId: member.id } }), 1);

  // 9. Now Member has access to workspace
  assert.equal((await request(base, path, member.cookie)).status, 200);
}));

