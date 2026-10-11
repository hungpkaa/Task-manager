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
test('UC38: permissions, data quality, dependency, capacity and Vietnam deadline boundaries', async () => fixture(async ({ base, client, workspaceId, otherWorkspaceId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const project = await create(base, workspaceId, owner.cookie); const path = `/projects/${project.id}`;
  const repository = createProjectRepository(client);
  await repository.assignManager(project.id, owner.id, pm.id, null); await repository.addMember(project.id, pm.id, member.id);
  const period = { periodStart: '2026-10-11', periodEnd: '2026-10-25' };
  const read = (now = new Date('2026-10-10T17:00:00Z')) => repository.risk(project.id, pm.id, period, now);
  assert.equal((await read()).level, 'UNKNOWN'); assert.equal((await read()).confidence, 'INCOMPLETE');
  const query = `${path}/risk?${new URLSearchParams(period)}`;
  assert.equal((await request(base, query)).status, 401);
  for (const user of [owner, member, outsider, admin]) assert.equal((await request(base, query, user.cookie)).status, 403);
  assert.equal((await request(base, query, pm.cookie)).status, 200);
  for (const suffix of ['periodStart=bad&periodEnd=2026-10-25', 'periodStart=2026-10-25&periodEnd=2026-10-11', 'periodStart=2026-10-11&periodEnd=2026-10-25&page=2']) assert.equal((await request(base, `${path}/risk?${suffix}`, pm.cookie)).status, 400);
  const done = await client.task.create({ data: { projectId: project.id, title: 'DONE ignored', status: 'DONE', dueDate: new Date('2026-10-01') } });
  assert.equal((await read()).level, 'LOW');
  const task = await client.task.create({ data: { projectId: project.id, title: 'Risk target', effort: 5, assigneeId: pm.id, startDate: new Date(period.periodStart), dueDate: new Date(period.periodEnd) } });
  const foreign = await client.project.create({ data: { workspaceId: otherWorkspaceId, name: 'Foreign Risk' } });
  await client.task.create({ data: { projectId: foreign.id, title: 'Foreign overdue', dueDate: new Date('2020-01-01') } });
  let cap = await repository.saveCapacity(project.id, pm.id, { ...period, userId: pm.id, capacityPoints: 10, expectedUpdatedAt: null });
  assert.equal((await read()).level, 'LOW');
  await client.taskDependency.create({ data: { projectId: project.id, taskId: task.id, dependsOnTaskId: done.id } });
  assert.equal((await read()).metrics.blockedCount, 0);
  await client.task.update({ where: { id: done.id }, data: { status: 'TODO', effort: 1, assigneeId: pm.id, dueDate: new Date(period.periodEnd) } });
  assert.equal((await read()).level, 'MEDIUM'); assert.equal((await read()).metrics.blockedCount, 1);
  await client.taskDependency.deleteMany({ where: { taskId: task.id } }); assert.equal((await read()).level, 'LOW');
  cap = await repository.saveCapacity(project.id, pm.id, { ...period, userId: pm.id, capacityPoints: 4, expectedUpdatedAt: cap.updatedAt.toISOString() });
  assert.equal((await read()).level, 'HIGH'); assert.equal((await read()).metrics.overloadedCount, 1);
  await repository.saveCapacity(project.id, pm.id, { ...period, userId: pm.id, capacityPoints: 10, expectedUpdatedAt: cap.updatedAt.toISOString() });
  await client.task.update({ where: { id: task.id }, data: { dueDate: new Date('2026-10-11') } });
  assert.equal((await read(new Date('2026-10-11T16:59:59Z'))).metrics.overdueCount, 0);
  const boundary = await read(new Date('2026-10-11T17:00:00Z')); assert.equal(boundary.today, '2026-10-12'); assert.equal(boundary.metrics.overdueCount, 1); assert.equal(boundary.level, 'HIGH');
  await client.task.update({ where: { id: task.id }, data: { status: 'DONE' } }); assert.equal((await read(new Date('2026-10-11T17:00:00Z'))).level, 'LOW');
  await client.task.update({ where: { id: done.id }, data: { effort: null, dueDate: null, assigneeId: null } });
  const incomplete = await read(); assert.equal(incomplete.level, 'UNKNOWN'); assert.equal(incomplete.confidence, 'INCOMPLETE'); assert.equal(incomplete.metrics.missingEffortCount, 1); assert.equal(incomplete.metrics.missingDeadlineCount, 1); assert.equal(incomplete.metrics.unassignedCount, 1);
  const version = (await client.task.findUniqueOrThrow({ where: { id: done.id } })).updatedAt;
  await read(); assert.equal((await client.task.findUniqueOrThrow({ where: { id: done.id } })).updatedAt.toISOString(), version.toISOString());
  await client.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } }); assert.equal((await request(base, query, pm.cookie)).status, 200);
}));

test('Risk compares exact Sprint progress ratios and Project end dates', async () => fixture(async ({ base, client, workspaceId, users }) => {
  const [owner, pm] = users; assert.ok(owner && pm);
  const project = await create(base, workspaceId, owner.cookie); const repository = createProjectRepository(client);
  await repository.assignManager(project.id, owner.id, pm.id, null);
  const period = { periodStart: '2026-10-11', periodEnd: '2026-10-25' };
  await repository.saveCapacity(project.id, pm.id, { ...period, userId: pm.id, capacityPoints: 10, expectedUpdatedAt: null });
  const sprint = await client.sprint.create({ data: { projectId: project.id, name: 'Progress', goal: 'Risk boundary', startDate: new Date('2026-10-11'), endDate: new Date('2026-10-14'), status: 'ACTIVE' } });
  await client.task.createMany({ data: Array.from({ length: 4 }, (_, index) => ({ projectId: project.id, sprintId: sprint.id, title: `Progress ${index}`, status: index === 0 ? 'DONE' as const : 'TODO' as const, effort: 1, assigneeId: pm.id, startDate: new Date('2026-10-11'), dueDate: new Date('2026-10-14') })) });
  const read = (day: string) => repository.risk(project.id, pm.id, period, new Date(`${day}T00:00:00Z`));
  assert.equal((await read('2026-10-11')).level, 'LOW'); assert.equal((await read('2026-10-11')).metrics.behindSprintCount, 0);
  assert.equal((await read('2026-10-12')).level, 'MEDIUM'); assert.equal((await read('2026-10-12')).metrics.behindSprintCount, 1);
  const overdue = await read('2026-10-15'); assert.equal(overdue.level, 'HIGH'); assert.equal(overdue.metrics.lateActiveSprintCount, 1); assert.equal(overdue.metrics.overdueCount, 3);
  await client.project.update({ where: { id: project.id }, data: { endDate: new Date('2026-10-14') } }); assert.equal((await read('2026-10-15')).metrics.projectOverdue, true);
  await client.task.updateMany({ where: { projectId: project.id }, data: { status: 'DONE' } });
  const completed = await read('2026-10-15'); assert.equal(completed.level, 'LOW'); assert.equal(completed.metrics.projectOverdue, false); assert.equal(completed.metrics.lateActiveSprintCount, 0);
}));

test('UC35–37: capacity permissions, exact periods, active effort, missing data and retained history', async () => fixture(async ({ base, client, workspaceId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const project = await create(base, workspaceId, owner.cookie); const path = `/projects/${project.id}`;
  assert.equal((await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null })).status, 200);
  assert.equal((await request(base, `${path}/members`, pm.cookie, 'POST', { userId: member.id })).status, 201);
  const period = { periodStart: '2026-10-11', periodEnd: '2026-10-25' };
  const input = { ...period, userId: member.id, capacityPoints: 5, expectedUpdatedAt: null };
  const query = `${path}/workload?${new URLSearchParams(period)}`;
  assert.equal((await request(base, query)).status, 401);
  const foreignOrigin = await fetch(`${base}/api${path}/capacities`, { method: 'PUT', headers: { Origin: 'https://foreign.invalid', Cookie: pm.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(foreignOrigin.status, 403);
  for (const user of [owner, member, outsider, admin]) {
    assert.equal((await request(base, query, user.cookie)).status, 403);
    assert.equal((await request(base, `${path}/capacities`, user.cookie)).status, 403);
    assert.equal((await request(base, `${path}/capacities`, user.cookie, 'PUT', input)).status, 403);
  }
  for (const invalid of [{ ...input, capacityPoints: 0 }, { ...input, capacityPoints: -1 }, { ...input, capacityPoints: 1.5 }, { ...input, capacityPoints: '5' }, { ...input, periodEnd: '2026-10-10' }, { ...input, periodStart: '2026-02-30' }, { ...input, userId: outsider.id }, { ...input, extra: true }]) assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', invalid)).status, 400);
  await client.user.update({ where: { id: member.id }, data: { status: 'LOCKED' } });
  assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', input)).status, 409);
  await client.user.update({ where: { id: member.id }, data: { status: 'ACTIVE' } });
  await client.task.createMany({ data: [
    { projectId: project.id, title: 'Undated', assigneeId: member.id, effort: 3 },
    { projectId: project.id, title: 'Start boundary', assigneeId: member.id, effort: 5, startDate: new Date('2026-10-25'), status: 'IN_PROGRESS' },
    { projectId: project.id, title: 'End boundary', assigneeId: member.id, dueDate: new Date('2026-10-11'), status: 'REVIEW' },
    { projectId: project.id, title: 'DONE excluded', assigneeId: member.id, effort: 8, status: 'DONE' },
    { projectId: project.id, title: 'Before excluded', assigneeId: member.id, effort: 8, dueDate: new Date('2026-10-10') },
    { projectId: project.id, title: 'After excluded', assigneeId: member.id, effort: 8, startDate: new Date('2026-10-26') },
    { projectId: project.id, title: 'Unassigned', effort: 2 },
  ] });
  type Report = { canEdit: boolean; summary: { taskCount: number; knownEffort: number; missingEffortCount: number; unassignedCount: number }; items: { user: { id: string }; taskCount: number; knownEffort: number; missingEffortCount: number; percent: number | null; overloaded: boolean; complete: boolean }[] };
  const before = await (await request(base, query, pm.cookie)).json() as Report;
  assert.equal(before.items.find((item) => item.user.id === member.id)?.percent, null);
  const saved = await request(base, `${path}/capacities`, pm.cookie, 'PUT', input); assert.equal(saved.status, 200);
  const capacity = (await saved.json() as { capacity: { updatedAt: string } }).capacity;
  const report = await (await request(base, query, pm.cookie)).json() as Report;
  assert.equal(report.summary.taskCount, 4); assert.equal(report.summary.knownEffort, 10); assert.equal(report.summary.missingEffortCount, 1); assert.equal(report.summary.unassignedCount, 1);
  const row = report.items.find((item) => item.user.id === member.id); assert.ok(row);
  assert.equal(row.taskCount, 3); assert.equal(row.knownEffort, 8); assert.equal(row.percent, 160); assert.equal(row.overloaded, true); assert.equal(row.complete, false);
  assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', input)).status, 409);
  const changed = await request(base, `${path}/capacities`, pm.cookie, 'PUT', { ...input, capacityPoints: 10, expectedUpdatedAt: capacity.updatedAt }); assert.equal(changed.status, 200);
  assert.equal((await (await request(base, query, pm.cookie)).json() as Report).items.find((item) => item.user.id === member.id)?.percent, 80);
  assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', { ...input, periodEnd: '2026-10-26' })).status, 409);
  const nextQuery = `${path}/workload?periodStart=2026-10-26&periodEnd=2026-11-01`;
  assert.equal((await (await request(base, nextQuery, pm.cookie)).json() as Report).items.find((item) => item.user.id === member.id)?.percent, null);
  await client.task.updateMany({ where: { projectId: project.id }, data: { status: 'DONE' } });
  assert.equal((await (await request(base, query, pm.cookie)).json() as Report).items.find((item) => item.user.id === member.id)?.percent, 0);
  assert.equal((await request(base, `${path}/members/${member.id}`, pm.cookie, 'DELETE', {})).status, 204);
  assert.equal((await (await request(base, `${path}/capacities`, pm.cookie)).json() as { total: number }).total, 1);
  assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', { ...input, periodStart: '2026-11-01', periodEnd: '2026-11-30' })).status, 400);
  assert.equal((await request(base, `${path}/close`, pm.cookie, 'POST', {})).status, 200);
  assert.equal((await (await request(base, query, pm.cookie)).json() as Report).canEdit, false);
  assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', { ...input, userId: pm.id })).status, 409);
}));

test('capacity concurrent creation and stale PM writes are serialized; DB enforces capacity constraints', async () => fixture(async ({ base, client, workspaceId, users }) => {
  const [owner, pm, member] = users; assert.ok(owner && pm && member);
  const project = await create(base, workspaceId, owner.cookie); const path = `/projects/${project.id}`;
  await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null });
  const input = { userId: pm.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', capacityPoints: 8, expectedUpdatedAt: null };
  const race = await Promise.all([request(base, `${path}/capacities`, pm.cookie, 'PUT', input), request(base, `${path}/capacities`, pm.cookie, 'PUT', { ...input, periodStart: '2026-10-15' })]);
  assert.deepEqual(race.map((item) => item.status).sort(), [200, 409]);
  assert.equal(await client.memberCapacity.count({ where: { projectId: project.id } }), 1);
  await request(base, `${path}/manager`, owner.cookie, 'PATCH', { managerUserId: member.id, expectedManagerUserId: pm.id });
  assert.equal((await request(base, `${path}/capacities`, pm.cookie, 'PUT', { ...input, periodStart: '2026-11-01', periodEnd: '2026-11-30' })).status, 403);
  const raw = { projectId: project.id, userId: member.id, periodStart: new Date('2026-12-01'), periodEnd: new Date('2026-12-31'), capacityPoints: 1 };
  await assert.rejects(client.memberCapacity.create({ data: { ...raw, capacityPoints: 0 } }));
  await assert.rejects(client.memberCapacity.create({ data: { ...raw, periodEnd: new Date('2026-11-30') } }));
  await client.memberCapacity.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ ...raw, periodStart: new Date(Date.UTC(2027, index, 1)), periodEnd: new Date(Date.UTC(2027, index + 1, 0)) })) });
  const history = await (await request(base, `${path}/capacities?page=2`, member.cookie)).json() as { total: number; items: unknown[] };
  assert.equal(history.total, 22); assert.equal(history.items.length, 2);
  for (let index = 0; index < 20; index++) {
    const extra = await client.user.create({ data: { email: `capacity-${randomUUID()}@example.invalid`, displayName: 'Extra member', passwordHash: 'fixture-only' } });
    users.push({ id: extra.id, cookie: '' });
    await client.workspaceMember.create({ data: { workspaceId, userId: extra.id } });
    await client.projectMember.create({ data: { projectId: project.id, workspaceId, userId: extra.id } });
  }
  const secondPage = await (await request(base, `${path}/workload?periodStart=2026-10-01&periodEnd=2026-10-31&page=2`, member.cookie)).json() as { total: number; items: unknown[] };
  assert.equal(secondPage.total, 22); assert.equal(secondPage.items.length, 2);
  const last = users.at(-1)!;
  await client.task.create({ data: { projectId: project.id, title: 'Risk beyond first member page', effort: 8, assigneeId: last.id, dueDate: new Date('2026-10-31') } });
  await client.memberCapacity.create({ data: { projectId: project.id, userId: last.id, periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), capacityPoints: 1 } });
  const risk = await createProjectRepository(client).risk(project.id, member.id, { periodStart: '2026-10-01', periodEnd: '2026-10-31' }, new Date('2026-10-11T00:00:00Z'));
  assert.equal(risk.level, 'HIGH'); assert.equal(risk.metrics.overloadedCount, 1);
  for (const query of ['periodStart=invalid&periodEnd=2026-11-30', 'periodStart=2026-12-01&periodEnd=2026-11-30', 'periodStart=2026-11-01&periodEnd=2026-11-30&page=0', 'periodStart=2026-11-01&periodEnd=2026-11-30&extra=1']) assert.equal((await request(base, `${path}/workload?${query}`, member.cookie)).status, 400);
}));

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
