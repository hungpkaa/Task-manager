import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/repositories/database.js';
import { createAuthService, tokenHash } from '../src/services/auth.js';
import { createSprintService } from '../src/services/sprints.js';
import { withHttp } from './helpers/http.js';
const origin = 'http://127.0.0.1:5173';
const input = { name: 'Sprint 1', goal: 'Hoàn thành đăng nhập', startDate: '2026-10-11', endDate: '2026-10-25' };
async function fixture(run: (context: { base: string; client: PrismaClient; database: ReturnType<typeof createDatabase>; projectId: string; otherId: string; users: { id: string; cookie: string }[] }) => Promise<void>) {
  const url = readConfig().databaseUrl;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const database = createDatabase(url); const auth = createAuthService(database.accounts);
  const users: { id: string; cookie: string }[] = [];
  let workspaceId: string | undefined;
  try {
    for (let index = 0; index < 5; index++) {
      const token = randomBytes(32).toString('base64url');
      const user = await client.user.create({ data: { email: `sprint-${randomUUID()}@example.invalid`, displayName: `Sprint test ${index}`, passwordHash: 'fixture-only', systemRole: index === 4 ? 'SYSTEM_ADMIN' : 'MEMBER', sessions: { create: { tokenHash: tokenHash(token)!, expiresAt: new Date(Date.now() + 120000) } } } });
      users.push({ id: user.id, cookie: `task_manager_session=${token}` });
    }
    const workspace = await database.workspaces.create(users[0]!.id, { name: 'Sprint tests', description: '' }); workspaceId = workspace.id;
    for (const user of users.slice(1, 4)) await client.workspaceMember.create({ data: { workspaceId, userId: user.id } });
    const project = await database.projects.create(workspaceId, users[0]!.id, { name: 'Sprint project', description: '', startDate: null, endDate: null });
    await database.projects.assignManager(project.id, users[0]!.id, users[1]!.id, null);
    await database.projects.addMember(project.id, users[1]!.id, users[2]!.id);
    const other = await database.projects.create(workspaceId, users[0]!.id, { name: 'Other project', description: '', startDate: null, endDate: null });
    const app = createApp(database, undefined, undefined, undefined, undefined, { service: createSprintService(database.sprints, auth), appOrigin: origin, secureCookies: false });
    await withHttp(app, (base) => run({ base, client, database, projectId: project.id, otherId: other.id, users }));
  } finally {
    try {
      if (workspaceId) { await client.project.deleteMany({ where: { workspaceId } }); await client.workspace.delete({ where: { id: workspaceId } }); }
      await client.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    } finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}
function request(base: string, path: string, cookie?: string, method = 'GET', body?: unknown, requestOrigin = origin) {
  return fetch(`${base}/api${path}`, { method, headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('UC44–45: scope, PM permissions, required Goal, valid dates, PLANNED and pagination', async () => fixture(async ({ base, client, projectId, otherId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const path = `/projects/${projectId}/sprints`;
  assert.equal((await request(base, path)).status, 401);
  for (const user of [owner, member]) assert.equal((await request(base, path, user.cookie)).status, 200);
  for (const user of [outsider, admin]) assert.equal((await request(base, path, user.cookie)).status, 403);
  for (const user of [owner, member, outsider, admin]) assert.equal((await request(base, path, user.cookie, 'POST', input)).status, 403);
  for (const bad of [{ ...input, goal: ' ' }, { ...input, endDate: '2026-10-01' }, { ...input, startDate: '2026-02-30' }, { ...input, status: 'ACTIVE' }, { ...input, projectId: otherId }]) assert.equal((await request(base, path, pm.cookie, 'POST', bad)).status, 400);
  assert.equal((await request(base, path, pm.cookie, 'POST', input, 'https://foreign.invalid')).status, 403);
  const response = await request(base, path, pm.cookie, 'POST', input); assert.equal(response.status, 201);
  const result = await response.json() as { sprint: { id: string; status: string; projectId: string } }; assert.equal(result.sprint.status, 'PLANNED'); assert.equal(result.sprint.projectId, projectId);
  await client.task.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ projectId, title: `Backlog ${index}` })) });
  const backlog = await (await request(base, `/projects/${projectId}/backlog?page=2`, member.cookie)).json() as { items: unknown[]; total: number }; assert.equal(backlog.total, 21); assert.equal(backlog.items.length, 1);
  assert.equal((await request(base, `/projects/${otherId}/backlog`, member.cookie)).status, 403);
  assert.equal((await request(base, `/projects/${otherId}/backlog?sprintId=${result.sprint.id}`, owner.cookie)).status, 404);
  assert.equal((await request(base, `${path}?page=0`, pm.cookie)).status, 400);
}));
test('UC46: preview warnings, atomic batch assignment, stale/cross-project rejection and PLANNED return', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member] = users; assert.ok(owner && pm && member);
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const prerequisite = await client.task.create({ data: { projectId, title: 'Dependency' } });
  const task = await client.task.create({ data: { projectId, title: 'Needs estimate', dueDate: new Date('2026-10-30') } });
  await client.taskDependency.create({ data: { taskId: task.id, projectId, dependsOnTaskId: prerequisite.id } });
  const ready = await client.task.create({ data: { projectId, title: 'Estimated', effort: 5, assigneeId: member.id } });
  const path = `/projects/${projectId}/sprints/${sprint.id}/plan`;
  const tasks = [task, ready].map(({ id, updatedAt }) => ({ id, updatedAt: updatedAt.toISOString() }));
  const previewResponse = await request(base, path, pm.cookie, 'POST', { tasks }); assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json() as { warnings: string[]; applied: boolean; totalEffort: number; missingEffort: number }; assert.equal(preview.applied, false); assert.equal(preview.totalEffort, 5); assert.equal(preview.missingEffort, 1); assert.match(preview.warnings.join(' '), /Capacity\/Workload.*chưa ước lượng.*Dependency.*hạn hoàn thành/s);
  assert.equal(await client.task.count({ where: { projectId, sprintId: sprint.id } }), 0);
  for (const user of [owner, member]) assert.equal((await request(base, path, user.cookie, 'POST', { tasks, confirmed: true })).status, 403);
  const foreign = await client.task.create({ data: { projectId: otherId, title: 'Other Task' } });
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks: [...tasks, { id: foreign.id, updatedAt: foreign.updatedAt.toISOString() }], confirmed: true })).status, 400);
  assert.equal(await client.task.count({ where: { sprintId: sprint.id } }), 0);
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks: [tasks[0], tasks[0]] })).status, 400);
  await client.task.update({ where: { id: ready.id }, data: { title: 'Changed', updatedAt: new Date(ready.updatedAt.getTime() + 1000) } });
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks, confirmed: true })).status, 409);
  assert.equal(await client.task.count({ where: { sprintId: sprint.id } }), 0);
  const changed = await client.task.findUniqueOrThrow({ where: { id: ready.id } }); tasks[1]!.updatedAt = changed.updatedAt.toISOString();
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks, confirmed: true })).status, 200);
  assert.equal(await client.task.count({ where: { sprintId: sprint.id } }), 2);
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks, confirmed: true })).status, 409);
  const assigned = await client.task.findUniqueOrThrow({ where: { id: task.id } });
  const returnPath = `/projects/${projectId}/sprints/${sprint.id}/tasks/${task.id}/return`;
  assert.equal((await request(base, returnPath, pm.cookie, 'POST', { updatedAt: task.updatedAt.toISOString() })).status, 409);
  assert.equal((await request(base, returnPath, pm.cookie, 'POST', { updatedAt: assigned.updatedAt.toISOString() })).status, 204);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).sprintId, null);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'ACTIVE' } });
  assert.equal((await request(base, returnPath, pm.cookie, 'POST', { updatedAt: assigned.updatedAt.toISOString() })).status, 409);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'COMPLETED' } });
  const current = await client.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks: [{ id: current.id, updatedAt: current.updatedAt.toISOString() }], confirmed: true })).status, 409);
}));
test('concurrent planning has one winner; DB protects same Project, dates and one ACTIVE; CLOSED is read only', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const pm = users[1]!;
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const second = await database.sprints.create(projectId, pm.id, { ...input, name: 'Second' });
  const task = await client.task.create({ data: { projectId, title: 'Race task', effort: 3 } });
  const body = { tasks: [{ id: task.id, updatedAt: task.updatedAt.toISOString() }], confirmed: true };
  const responses = await Promise.all([sprint, second].map((target) => request(base, `/projects/${projectId}/sprints/${target.id}/plan`, pm.cookie, 'POST', body)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  await assert.rejects(client.sprint.update({ where: { id: sprint.id }, data: { endDate: new Date('2026-10-01') } }));
  await assert.rejects(client.task.create({ data: { projectId: otherId, title: 'Cross Project', sprintId: sprint.id } }));
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'ACTIVE' } });
  await assert.rejects(client.sprint.update({ where: { id: second.id }, data: { status: 'ACTIVE' } }));
  await client.project.update({ where: { id: projectId }, data: { status: 'CLOSED' } });
  const path = `/projects/${projectId}/sprints`;
  assert.equal((await request(base, path, pm.cookie)).status, 200);
  assert.equal((await request(base, path, pm.cookie, 'POST', input)).status, 409);
  assert.equal((await request(base, `/projects/${projectId}/sprints/${second.id}/plan`, pm.cookie, 'POST', body)).status, 409);
}));
