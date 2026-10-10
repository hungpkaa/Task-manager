import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/repositories/database.js';
import { createProjectRepository } from '../src/repositories/projects.js';
import { createAuthService, tokenHash } from '../src/services/auth.js';
import { createWorkspaceService, createNotificationService } from '../src/services/workspaces.js';
import { createProjectService } from '../src/services/projects.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173';
async function fixture(run: (context: { base: string; client: PrismaClient; workspaceId: string; otherWorkspaceId: string; users: { id: string; cookie: string }[] }) => Promise<void>) {
  const url = readConfig().databaseUrl;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
  const database = createDatabase(url); const auth = createAuthService(database.accounts);
  const common = { appOrigin: origin, secureCookies: false };
  const app = createApp(database, { ...common, service: auth }, { ...common, service: createWorkspaceService(database.workspaces, auth), notifications: createNotificationService(database.notifications, auth) }, { ...common, service: createProjectService(database.projects, auth) });
  const users: { id: string; cookie: string }[] = [];
  try {
    for (let index = 0; index < 5; index++) {
      const token = randomBytes(32).toString('base64url');
      const user = await client.user.create({ data: { email: `project-${randomUUID()}@example.invalid`, displayName: `Project test ${index}`, passwordHash: 'fixture-only', systemRole: index === 4 ? 'SYSTEM_ADMIN' : 'MEMBER', sessions: { create: { tokenHash: tokenHash(token)!, expiresAt: new Date(Date.now() + 120_000) } } } });
      users.push({ id: user.id, cookie: `task_manager_session=${token}` });
    }
    const workspace = await database.workspaces.create(users[0]!.id, { name: 'Project tests', description: '' });
    for (const user of users.slice(1, 3)) await client.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id } });
    const other = await database.workspaces.create(users[3]!.id, { name: 'Other workspace', description: '' });
    await withHttp(app, (base) => run({ base, client, users, workspaceId: workspace.id, otherWorkspaceId: other.id }));
  } finally {
    try {
      const workspaces = await client.workspace.findMany({ where: { createdBy: { in: users.map((user) => user.id) } }, select: { id: true } });
      // Explicit order also supports restrictive membership foreign keys.
      await client.project.deleteMany({ where: { workspaceId: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    } finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}
function request(base: string, path: string, cookie?: string, method = 'GET', body?: unknown) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
}
async function create(base: string, workspaceId: string, cookie: string) {
  const response = await request(base, `/workspaces/${workspaceId}/projects`, cookie, 'POST', { name: ' Project ', description: ' Mô tả ', startDate: '2026-10-10', endDate: '2026-11-10' });
  assert.equal(response.status, 201); return (await response.json() as { project: { id: string; managerUserId: string | null; status: string } }).project;
}
test('UC12–17: Owner creates/assigns; only current PM edits, manages members and closes; history persists', async () => fixture(async ({ base, client, workspaceId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const list = `/workspaces/${workspaceId}/projects`;
  assert.equal((await request(base, list)).status, 401);
  assert.equal((await request(base, list, pm.cookie, 'POST', { name: 'Denied' })).status, 403);
  const created = await create(base, workspaceId, owner.cookie); const path = `/projects/${created.id}`;
  assert.equal(created.managerUserId, null); assert.equal(created.status, 'ACTIVE');
  assert.equal((await (await request(base, list, member.cookie)).json() as { projects: unknown[] }).projects.length, 0);
  assert.equal((await request(base, path, owner.cookie, 'PATCH', { name: 'Owner cannot edit' })).status, 403);
  assert.equal((await request(base, path, owner.cookie, 'POST', {})).status, 404);
  assert.equal((await request(base, path, member.cookie)).status, 403);
  for (const user of [outsider, admin]) assert.equal((await request(base, path, user.cookie)).status, 403);
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null })).status, 200);
  assert.equal(await client.projectMember.count({ where: { projectId: created.id, userId: pm.id } }), 1);
  assert.equal((await request(base, path, pm.cookie, 'PATCH', { name: 'PM đã sửa' })).status, 200);
  assert.equal((await (await request(base, list, pm.cookie)).json() as { projects: unknown[] }).projects.length, 1);
  assert.equal((await request(base, `${path}/members`, owner.cookie, 'POST', { userId: member.id })).status, 403);
  assert.equal((await request(base, `${path}/members`, pm.cookie, 'POST', { userId: member.id })).status, 201);
  assert.equal((await request(base, `${path}/members`, pm.cookie, 'POST', { userId: member.id })).status, 409);
  assert.equal((await request(base, path, member.cookie)).status, 200);
  assert.equal((await request(base, `${path}/members`, member.cookie)).status, 200);
  assert.equal((await request(base, path, member.cookie, 'PATCH', { name: 'Denied' })).status, 403);
  assert.equal((await request(base, `${path}/members/${pm.id}`, pm.cookie, 'DELETE', {})).status, 409);
  assert.equal((await request(base, `/workspaces/${workspaceId}/members/${pm.id}`, owner.cookie, 'DELETE', {})).status, 409);
  const replaced = await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: member.id, expectedManagerUserId: pm.id });
  assert.equal(replaced.status, 200);
  assert.equal((await request(base, path, pm.cookie, 'PATCH', { name: 'Old PM' })).status, 403);
  assert.equal((await request(base, path, pm.cookie)).status, 200);
  assert.equal((await request(base, `${path}/members/${pm.id}`, member.cookie, 'DELETE', {})).status, 204);
  assert.equal((await request(base, path, pm.cookie)).status, 403);
  assert.equal((await request(base, `${path}/close`, owner.cookie, 'POST', {})).status, 403);
  assert.equal((await request(base, `${path}/close`, member.cookie, 'POST', {})).status, 200);
  const stored = await client.project.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.status, 'CLOSED'); assert.ok(stored.closedAt); assert.equal(stored.name, 'PM đã sửa');
  assert.equal((await request(base, path, owner.cookie)).status, 200);
  for (const [subpath, method, body] of [['', 'PATCH', { name: 'Closed' }], ['/members', 'POST', { userId: pm.id }]] as const) assert.equal((await request(base, `${path}${subpath}`, member.cookie, method, body)).status, 409);
  const before = await client.notification.count({ where: { relatedEntityId: created.id, type: 'PROJECT_CLOSED' } });
  assert.equal((await request(base, `${path}/close`, member.cookie, 'POST', {})).status, 200);
  assert.equal(await client.notification.count({ where: { relatedEntityId: created.id, type: 'PROJECT_CLOSED' } }), before);
  assert.ok(await client.notification.count({ where: { relatedEntityId: created.id, userId: member.id } }) >= 2);
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: member.id })).status, 200);
  assert.equal((await request(base, `/workspaces/${workspaceId}/members/${member.id}`, owner.cookie, 'DELETE', {})).status, 204);
  assert.equal((await client.project.findUniqueOrThrow({ where: { id: created.id } })).status, 'CLOSED');
  assert.equal((await request(base, path, pm.cookie, 'PATCH', { name: 'Cannot reopen' })).status, 409);
}));

test('manager assignment racing workspace removal never leaves a PM outside the Workspace', async () => fixture(async ({ base, client, workspaceId, users }) => {
  const [owner, pm] = users; assert.ok(owner && pm);
  const project = await create(base, workspaceId, owner.cookie);
  const [assignment, removal] = await Promise.all([
    request(base, `/projects/${project.id}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null }),
    request(base, `/workspaces/${workspaceId}/members/${pm.id}`, owner.cookie, 'DELETE', {}),
  ]);
  const stored = await client.project.findUniqueOrThrow({ where: { id: project.id } });
  if (assignment.status === 200) {
    assert.equal(removal.status, 409); assert.equal(stored.managerUserId, pm.id);
    assert.equal(await client.workspaceMember.count({ where: { workspaceId, userId: pm.id } }), 1);
  } else {
    assert.equal(assignment.status, 400); assert.equal(removal.status, 204); assert.equal(stored.managerUserId, null);
    assert.equal(await client.projectMember.count({ where: { projectId: project.id, userId: pm.id } }), 0);
  }
}));

test('Project input, merged date validation, workspace membership and manager replacement version are enforced', async () => fixture(async ({ base, client, workspaceId, otherWorkspaceId, users }) => {
  const [owner, pm, member, outsider] = users; assert.ok(owner && pm && member && outsider);
  const list = `/workspaces/${workspaceId}/projects`;
  for (const input of [{ name: ' ' }, { name: 'x', managerUserId: pm.id }, { name: 'x', startDate: '2026-02-30' }, { name: 'x', startDate: '2026-10-10', endDate: '2026-01-01' }]) assert.equal((await request(base, list, owner.cookie, 'POST', input)).status, 400);
  assert.equal(await client.project.count({ where: { workspaceId } }), 0);
  const created = await create(base, workspaceId, owner.cookie); const path = `/projects/${created.id}`;
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: outsider.id, expectedManagerUserId: null })).status, 400);
  await client.user.update({ where: { id: member.id }, data: { status: 'LOCKED' } });
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: member.id, expectedManagerUserId: null })).status, 409);
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null })).status, 200);
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: owner.id, expectedManagerUserId: null })).status, 409);
  assert.equal((await request(base, path, pm.cookie, 'PATCH', { endDate: '2026-10-01' })).status, 400);
  assert.equal((await request(base, path, pm.cookie, 'PATCH', { startDate: '2026-12-01' })).status, 400);
  assert.equal((await request(base, path, pm.cookie, 'PATCH', { workspaceId: otherWorkspaceId })).status, 400);
  assert.equal((await request(base, `${path}/members`, pm.cookie, 'POST', { userId: outsider.id })).status, 400);
  assert.equal((await request(base, `${path}/members`, pm.cookie, 'POST', { userId: member.id })).status, 409);
  const foreign = await fetch(`${base}/api${path}`, { method: 'PATCH', headers: { Origin: 'https://evil.example', Cookie: pm.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hacked' }) });
  assert.equal(foreign.status, 403);
  assert.equal((await request(base, '/projects/not-a-uuid', owner.cookie)).status, 400);
  assert.equal((await request(base, `/projects/${randomUUID()}`, owner.cookie)).status, 404);
  await assert.rejects(client.project.update({ where: { id: created.id }, data: { endDate: new Date('2026-01-01') } }));
  await assert.rejects(client.project.update({ where: { id: created.id }, data: { managerUserId: outsider.id } }));
  await assert.rejects(client.projectMember.create({ data: { projectId: created.id, workspaceId: otherWorkspaceId, userId: outsider.id } }));
}));

test('workspace removal clears ordinary project memberships, while other projects and users remain isolated', async () => fixture(async ({ base, client, workspaceId, otherWorkspaceId, users }) => {
  const [owner, pm, member, outsider] = users; assert.ok(owner && pm && member && outsider);
  const first = await create(base, workspaceId, owner.cookie);
  const second = await create(base, otherWorkspaceId, outsider.cookie);
  const path = `/projects/${first.id}`;
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null })).status, 200);
  assert.equal((await request(base, `${path}/members`, pm.cookie, 'POST', { userId: member.id })).status, 201);
  assert.equal((await request(base, `/projects/${second.id}/members`, pm.cookie, 'POST', { userId: member.id })).status, 403);
  assert.equal((await request(base, `${path}/members/${outsider.id}`, pm.cookie, 'DELETE', {})).status, 404);
  assert.equal((await request(base, `/workspaces/${workspaceId}/members/${member.id}`, owner.cookie, 'DELETE', {})).status, 204);
  assert.equal(await client.projectMember.count({ where: { projectId: first.id, userId: member.id } }), 0);
  assert.equal((await request(base, path, member.cookie)).status, 403);
  assert.equal((await client.project.findUniqueOrThrow({ where: { id: second.id } })).workspaceId, otherWorkspaceId);
}));

test('concurrent PM assignments reject stale confirmation and manager replacement rolls back if notification fails', async () => fixture(async ({ base, client, workspaceId, users }) => {
  const [owner, pm, member] = users; assert.ok(owner && pm && member);
  const project = await create(base, workspaceId, owner.cookie); const path = `/projects/${project.id}/manager`;
  const results = await Promise.all([pm, member].map((user) => request(base, path, owner.cookie, 'PATCH', { managerUserId: user.id, expectedManagerUserId: null })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const stored = await client.project.findUniqueOrThrow({ where: { id: project.id } });
  const next = stored.managerUserId === pm.id ? member : pm;
  const wrapped = { $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => client.$transaction((tx) => operation(new Proxy(tx, { get(target, key) {
    if (key === 'notification') return new Proxy(target.notification, { get(delegate, action) { if (action === 'create') return async () => { throw new Error('Injected notification failure'); }; return Reflect.get(delegate, action); } });
    return Reflect.get(target, key);
  } }))) } as unknown as PrismaClient;
  await assert.rejects(createProjectRepository(wrapped).assignManager(project.id, owner.id, next.id, stored.managerUserId), /Injected/);
  assert.equal((await client.project.findUniqueOrThrow({ where: { id: project.id } })).managerUserId, stored.managerUserId);
  assert.equal(await client.projectMember.count({ where: { projectId: project.id, userId: next.id } }), 0);
  assert.equal(await client.notification.count({ where: { relatedEntityId: project.id } }), 1);
}));
