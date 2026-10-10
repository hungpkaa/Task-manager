import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/repositories/database.js';
import { createTaskRepository } from '../src/repositories/tasks.js';
import { createAuthService, tokenHash } from '../src/services/auth.js';
import { createWorkspaceService, createNotificationService } from '../src/services/workspaces.js';
import { createProjectService } from '../src/services/projects.js';
import { createTaskService } from '../src/services/tasks.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173';
type UserFixture = { id: string; cookie: string };
async function fixture(run: (context: { base: string; client: PrismaClient; workspaceId: string; projectId: string; otherProjectId: string; users: UserFixture[] }) => Promise<void>) {
  const url = readConfig().databaseUrl;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
  const database = createDatabase(url); const auth = createAuthService(database.accounts);
  const common = { appOrigin: origin, secureCookies: false };
  const app = createApp(database, { ...common, service: auth }, { ...common, service: createWorkspaceService(database.workspaces, auth), notifications: createNotificationService(database.notifications, auth) }, { ...common, service: createProjectService(database.projects, auth) }, { ...common, service: createTaskService(database.tasks, auth) });
  const users: UserFixture[] = [];
  try {
    for (let index = 0; index < 6; index++) {
      const token = randomBytes(32).toString('base64url');
      const user = await client.user.create({ data: { email: `task-${randomUUID()}@example.invalid`, displayName: `Task test ${index}`, passwordHash: 'fixture-only', systemRole: index === 5 ? 'SYSTEM_ADMIN' : 'MEMBER', sessions: { create: { tokenHash: tokenHash(token)!, expiresAt: new Date(Date.now() + 120_000) } } } });
      users.push({ id: user.id, cookie: `task_manager_session=${token}` });
    }
    const workspace = await database.workspaces.create(users[0]!.id, { name: 'Task tests', description: '' });
    for (const user of users.slice(1, 5)) await client.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id } });
    const project = await database.projects.create(workspace.id, users[0]!.id, { name: 'Task project', description: '', startDate: null, endDate: null });
    await database.projects.assignManager(project.id, users[0]!.id, users[1]!.id, null);
    for (const user of users.slice(2, 4)) await database.projects.addMember(project.id, users[1]!.id, user.id);
    const other = await database.projects.create(workspace.id, users[0]!.id, { name: 'Private project', description: '', startDate: null, endDate: null });
    await withHttp(app, (base) => run({ base, client, users, workspaceId: workspace.id, projectId: project.id, otherProjectId: other.id }));
  } finally {
    try {
      const ids = users.map((user) => user.id);
      const workspaces = await client.workspace.findMany({ where: { createdBy: { in: ids } }, select: { id: true } });
      await client.project.deleteMany({ where: { workspaceId: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaces.map((workspace) => workspace.id) } } });
      await client.user.deleteMany({ where: { id: { in: ids } } });
    } finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}
function request(base: string, path: string, user?: UserFixture, method = 'GET', body?: unknown) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, ...(user ? { Cookie: user.cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
}
async function create(base: string, projectId: string, pm: UserFixture, data: Record<string, unknown> = {}) {
  const response = await request(base, `/projects/${projectId}/tasks`, pm, 'POST', { title: ' Công việc ', ...data });
  assert.equal(response.status, 201);
  return (await response.json() as { task: { id: string; status: string; priority: string; assigneeId: string | null; sprintId: string | null; canEdit: boolean } }).task;
}
test('Task CRUD, assignment notifications, sequential status and persisted My Tasks follow UC18–24/27', async () => fixture(async ({ base, client, projectId, users }) => {
  const [owner, pm, assignee, member] = users; assert.ok(owner && pm && assignee && member);
  const task = await create(base, projectId, pm, { assigneeId: assignee.id, startDate: '2026-10-10', dueDate: '2026-10-20', effort: 5 });
  assert.equal(task.status, 'TODO'); assert.equal(task.priority, 'MEDIUM'); assert.equal(task.sprintId, null); assert.equal(task.canEdit, true);
  assert.equal(await client.notification.count({ where: { relatedEntityId: task.id, userId: assignee.id } }), 1);
  const path = `/tasks/${task.id}`;
  assert.equal((await request(base, path, assignee)).status, 200);
  assert.equal((await request(base, path, owner)).status, 200);
  assert.equal((await request(base, path, pm, 'PATCH', { title: ' Đã sửa ', priority: 'HIGH' })).status, 200);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).title, 'Đã sửa');
  const mine = await (await request(base, '/tasks/mine', assignee)).json() as { tasks: { id: string }[]; total: number };
  assert.equal(mine.total, 1); assert.equal(mine.tasks[0]!.id, task.id);
  assert.equal((await (await request(base, '/tasks/mine', member)).json() as { total: number }).total, 0);
  for (const [expectedStatus, status] of [['TODO', 'IN_PROGRESS'], ['IN_PROGRESS', 'REVIEW'], ['REVIEW', 'DONE']]) assert.equal((await request(base, `${path}/status`, assignee, 'PATCH', { expectedStatus, status })).status, 200);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'DONE');
  assert.equal((await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeId: member.id })).status, 200);
  assert.equal((await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeId: member.id })).status, 200);
  assert.equal(await client.notification.count({ where: { relatedEntityId: task.id, userId: member.id } }), 1);
  assert.equal((await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeId: null })).status, 200);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId, null);
  assert.equal((await request(base, path, pm, 'DELETE', {})).status, 204);
  assert.equal((await request(base, path, pm)).status, 404);
}));

test('Owner/admin/member/outsider cannot gain PM or assignee permissions by IDs or injected fields', async () => fixture(async ({ base, projectId, otherProjectId, users }) => {
  const [owner, pm, assignee, member, workspaceOnly, admin] = users; assert.ok(owner && pm && assignee && member && workspaceOnly && admin);
  const list = `/projects/${projectId}/tasks`; const task = await create(base, projectId, pm, { assigneeId: assignee.id }); const path = `/tasks/${task.id}`;
  assert.equal((await request(base, list)).status, 401);
  for (const user of [owner, assignee, member, workspaceOnly, admin]) {
    assert.equal((await request(base, list, user, 'POST', { title: 'Denied' })).status, 403);
    assert.equal((await request(base, path, user, 'PATCH', { title: 'Denied' })).status, 403);
    assert.equal((await request(base, `${path}/assignee`, user, 'PATCH', { assigneeId: user.id })).status, 403);
    assert.equal((await request(base, path, user, 'DELETE', {})).status, 403);
  }
  for (const user of [owner, member, workspaceOnly, admin]) assert.equal((await request(base, `${path}/status`, user, 'PATCH', { status: 'IN_PROGRESS', expectedStatus: 'TODO' })).status, 403);
  for (const user of [workspaceOnly, admin]) { assert.equal((await request(base, list, user)).status, 403); assert.equal((await request(base, path, user)).status, 403); }
  assert.equal((await request(base, `/projects/${otherProjectId}/tasks`, assignee)).status, 403);
  for (const body of [{ projectId: otherProjectId }, { status: 'DONE' }, { assigneeId: member.id }, { sprintId: randomUUID() }]) assert.equal((await request(base, path, pm, 'PATCH', body)).status, 400);
  assert.equal((await request(base, `${path}/status`, assignee, 'PATCH', { status: 'DONE', expectedStatus: 'TODO' })).status, 409);
  assert.equal((await request(base, `${path}/status`, assignee, 'PATCH', { status: 'BLOCKED', expectedStatus: 'TODO' })).status, 400);
}));

test('invalid dates, effort, assignees, Origin and query values leave stored tasks unchanged', async () => fixture(async ({ base, client, projectId, users }) => {
  const [, pm, assignee, , workspaceOnly, admin] = users; assert.ok(pm && assignee && workspaceOnly && admin);
  const list = `/projects/${projectId}/tasks`;
  for (const body of [{ title: ' ' }, { title: 'x', startDate: '2026-02-30' }, { title: 'x', startDate: '2026-10-10', dueDate: '2026-10-09' }, { title: 'x', effort: 4 }, { title: 'x', status: 'DONE' }]) assert.equal((await request(base, list, pm, 'POST', body)).status, 400);
  assert.equal(await client.task.count({ where: { projectId } }), 0);
  const task = await create(base, projectId, pm, { startDate: '2026-10-10', dueDate: '2026-10-20' }); const path = `/tasks/${task.id}`;
  for (const body of [{ dueDate: '2026-10-09' }, { startDate: '2026-10-21' }, { effort: 0 }, {}]) assert.equal((await request(base, path, pm, 'PATCH', body)).status, 400);
  for (const user of [workspaceOnly, admin]) assert.equal((await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeId: user.id })).status, 400);
  await client.user.update({ where: { id: assignee.id }, data: { status: 'LOCKED' } });
  assert.equal((await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeId: assignee.id })).status, 409);
  assert.equal((await request(base, '/tasks/not-a-uuid', pm)).status, 400);
  assert.equal((await request(base, `/tasks/${randomUUID()}`, pm)).status, 404);
  for (const query of ['status=BLOCKED', 'page=0', 'pageSize=101', 'sort=passwordHash', 'unexpected=1', 'q[a]=x']) assert.equal((await request(base, `${list}?${query}`, pm)).status, 400);
  assert.equal((await request(base, `/tasks/mine?assigneeId=${admin.id}`, pm)).status, 400);
  const foreign = await fetch(`${base}/api${path}`, { method: 'PATCH', headers: { Origin: 'https://evil.example', Cookie: pm.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Hacked' }) });
  assert.equal(foreign.status, 403);
  for (const data of [{ dueDate: new Date('2026-10-01') }, { effort: 4 }, { sprintId: randomUUID() }]) await assert.rejects(client.task.update({ where: { id: task.id }, data }));
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).title, 'Công việc');
}));

test('search, filter, sort, pagination and My Tasks cannot expose tasks outside the caller scope', async () => fixture(async ({ base, client, projectId, otherProjectId, users }) => {
  const [, pm, assignee, member] = users; assert.ok(pm && assignee && member);
  await client.task.createMany({ data: [
    { projectId, title: 'Alpha', description: 'Design search', priority: 'HIGH', assigneeId: assignee.id, dueDate: new Date('2026-10-11') },
    { projectId, title: 'Beta', priority: 'LOW', assigneeId: member.id, dueDate: new Date('2026-10-12') },
    { projectId, title: 'Gamma', priority: 'HIGH', status: 'DONE' },
    { projectId: otherProjectId, title: 'Secret', assigneeId: assignee.id },
  ] });
  const list = `/projects/${projectId}/tasks`;
  const filtered = await (await request(base, `${list}?q=DESIGN&priority=HIGH&assigneeId=${assignee.id}`, pm)).json() as { total: number; tasks: { title: string }[] };
  assert.equal(filtered.total, 1); assert.equal(filtered.tasks[0]!.title, 'Alpha');
  const first = await (await request(base, `${list}?sort=title&direction=asc&pageSize=2`, assignee)).json() as { total: number; tasks: { title: string }[] };
  assert.equal(first.total, 3); assert.deepEqual(first.tasks.map((task) => task.title), ['Alpha', 'Beta']);
  const second = await (await request(base, `${list}?sort=title&direction=asc&pageSize=2&page=2`, assignee)).json() as { tasks: { title: string }[] };
  assert.deepEqual(second.tasks.map((task) => task.title), ['Gamma']);
  const mine = await (await request(base, '/tasks/mine', assignee)).json() as { total: number; tasks: { title: string }[] };
  assert.equal(mine.total, 1); assert.equal(mine.tasks[0]!.title, 'Alpha');
  assert.equal((await (await request(base, `${list}?assigneeId=unassigned&status=DONE`, pm)).json() as { total: number }).total, 1);
  const deadline = await (await request(base, `${list}?sort=dueDate&direction=desc`, pm)).json() as { tasks: { title: string }[] };
  assert.deepEqual(deadline.tasks.map((task) => task.title), ['Beta', 'Alpha', 'Gamma']);
}));

test('dependency assessment warns before status change and stays separate from Task status', async () => fixture(async ({ base, client, projectId, otherProjectId, users }) => {
  const [, pm, assignee] = users; assert.ok(pm && assignee);
  const prerequisite = await create(base, projectId, pm); const task = await create(base, projectId, pm, { assigneeId: assignee.id });
  await client.taskDependency.create({ data: { taskId: task.id, dependsOnTaskId: prerequisite.id, projectId } });
  const detail = await (await request(base, `/tasks/${task.id}`, assignee)).json() as { task: { blocked: boolean; status: string; blockingTasks: unknown[] } };
  assert.equal(detail.task.blocked, true); assert.equal(detail.task.status, 'TODO'); assert.equal(detail.task.blockingTasks.length, 1);
  const path = `/tasks/${task.id}/status`; const body = { status: 'IN_PROGRESS', expectedStatus: 'TODO' };
  assert.equal((await request(base, path, assignee, 'PATCH', body)).status, 409);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'TODO');
  const acknowledged = await request(base, path, assignee, 'PATCH', { ...body, acknowledgeBlocked: true }); assert.equal(acknowledged.status, 200);
  assert.ok((await acknowledged.json() as { warning: string }).warning);
  assert.equal((await request(base, `/tasks/${prerequisite.id}`, pm, 'DELETE', {})).status, 409);
  await client.task.update({ where: { id: prerequisite.id }, data: { status: 'DONE' } });
  assert.equal((await (await request(base, `/tasks/${task.id}`, assignee)).json() as { task: { blocked: boolean } }).task.blocked, false);
  assert.equal((await request(base, path, assignee, 'PATCH', { status: 'REVIEW', expectedStatus: 'IN_PROGRESS' })).status, 200);
  await assert.rejects(client.taskDependency.create({ data: { taskId: task.id, dependsOnTaskId: task.id, projectId } }));
  const other = await client.task.create({ data: { projectId: otherProjectId, title: 'Other' } });
  await assert.rejects(client.taskDependency.create({ data: { taskId: task.id, dependsOnTaskId: other.id, projectId } }));
}));

test('active assignments block member removal and incomplete tasks block Project close; DONE history is retained', async () => fixture(async ({ base, client, workspaceId, projectId, users }) => {
  const [owner, pm, assignee] = users; assert.ok(owner && pm && assignee);
  const task = await create(base, projectId, pm, { assigneeId: assignee.id });
  assert.equal((await request(base, `/projects/${projectId}/members/${assignee.id}`, pm, 'DELETE', {})).status, 409);
  assert.equal((await request(base, `/workspaces/${workspaceId}/members/${assignee.id}`, owner, 'DELETE', {})).status, 409);
  assert.equal((await request(base, `/projects/${projectId}/close`, pm, 'POST', {})).status, 409);
  for (const [expectedStatus, status] of [['TODO', 'IN_PROGRESS'], ['IN_PROGRESS', 'REVIEW'], ['REVIEW', 'DONE']]) assert.equal((await request(base, `/tasks/${task.id}/status`, assignee, 'PATCH', { expectedStatus, status })).status, 200);
  assert.equal((await request(base, `/projects/${projectId}/members/${assignee.id}`, pm, 'DELETE', {})).status, 204);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId, assignee.id);
  assert.equal((await request(base, `/tasks/${task.id}`, assignee)).status, 403);
  assert.equal((await (await request(base, '/tasks/mine', assignee)).json() as { total: number }).total, 0);
  assert.equal((await request(base, `/projects/${projectId}/close`, pm, 'POST', {})).status, 200);
  for (const [path, method, body] of [[`/tasks/${task.id}`, 'PATCH', { title: 'Denied' }], [`/tasks/${task.id}/assignee`, 'PATCH', { assigneeId: null }], [`/tasks/${task.id}`, 'DELETE', {}], [`/projects/${projectId}/tasks`, 'POST', { title: 'Denied' }]] as const) assert.equal((await request(base, path, pm, method, body)).status, 409);
  assert.equal((await request(base, `/tasks/${task.id}`, owner)).status, 200);
}));

test('concurrent status changes and member removal versus assignment are serialized', async () => fixture(async ({ base, client, projectId, users }) => {
  const [, pm, assignee, member] = users; assert.ok(pm && assignee && member);
  const task = await create(base, projectId, pm, { assigneeId: assignee.id });
  const status = await Promise.all([0, 1].map(() => request(base, `/tasks/${task.id}/status`, assignee, 'PATCH', { status: 'IN_PROGRESS', expectedStatus: 'TODO' })));
  assert.deepEqual(status.map((response) => response.status).sort(), [200, 409]);
  const fresh = await create(base, projectId, pm);
  const [assignment, removal] = await Promise.all([request(base, `/tasks/${fresh.id}/assignee`, pm, 'PATCH', { assigneeId: member.id }), request(base, `/projects/${projectId}/members/${member.id}`, pm, 'DELETE', {})]);
  if (assignment.status === 200) { assert.equal(removal.status, 409); assert.equal((await client.task.findUniqueOrThrow({ where: { id: fresh.id } })).assigneeId, member.id); }
  else { assert.equal(assignment.status, 400); assert.equal(removal.status, 204); assert.equal((await client.task.findUniqueOrThrow({ where: { id: fresh.id } })).assigneeId, null); }
}));

test('notification failure rolls back Task creation and reassignment', async () => fixture(async ({ client, projectId, users }) => {
  const [, pm, assignee] = users; assert.ok(pm && assignee);
  const wrapped = { $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => client.$transaction((tx) => operation(new Proxy(tx, { get(target, key) {
    if (key === 'notification') return new Proxy(target.notification, { get(delegate, action) { if (action === 'create') return async () => { throw new Error('Injected notification failure'); }; return Reflect.get(delegate, action); } });
    return Reflect.get(target, key);
  } }))), task: client.task } as unknown as PrismaClient;
  const repo = createTaskRepository(wrapped);
  await assert.rejects(repo.create(projectId, pm.id, { title: 'Roll back', description: '', priority: 'MEDIUM', assigneeId: assignee.id, startDate: null, dueDate: null, effort: null }), /Injected/);
  assert.equal(await client.task.count({ where: { projectId } }), 0);
  const task = await client.task.create({ data: { projectId, title: 'Unassigned' } });
  await assert.rejects(repo.assign(task.id, pm.id, assignee.id), /Injected/);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId, null);
  assert.equal(await client.notification.count({ where: { relatedEntityId: task.id } }), 0);
}));
