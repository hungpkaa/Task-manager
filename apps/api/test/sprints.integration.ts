import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createSprintRepository } from '../src/repositories/sprints.js';
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
async function confirmStart(repository: ReturnType<typeof createSprintRepository>, projectId: string, actorId: string, sprint: { id: string; updatedAt: Date }) {
  const preview = await repository.start(projectId, actorId, sprint.id, sprint.updatedAt.toISOString(), false);
  return repository.start(projectId, actorId, sprint.id, sprint.updatedAt.toISOString(), true, preview.snapshot);
}
test('Sprint workload includes existing and selected commitments once; capacities, missing data and stale previews', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member] = users; assert.ok(owner && pm && member);
  const target = await database.sprints.create(projectId, pm.id, input);
  await client.task.create({ data: { projectId, sprintId: target.id, title: 'Existing commitment', effort: 3, assigneeId: pm.id } });
  const selected = await client.task.create({ data: { projectId, title: 'Selected', effort: 5, assigneeId: pm.id } });
  const outside = await client.task.create({ data: { projectId, title: 'Commitment outside dates', effort: 2, assigneeId: member.id, startDate: new Date('2026-11-01') } });
  const unassigned = await client.task.create({ data: { projectId, title: 'Unassigned without effort' } });
  const otherWork = await client.task.create({ data: { projectId, title: 'Other current work', effort: 5, assigneeId: pm.id } });
  await client.task.createMany({ data: [
    { projectId, title: 'DONE excluded', effort: 8, status: 'DONE', assigneeId: pm.id },
    { projectId, title: 'Later excluded', effort: 8, startDate: new Date('2026-10-26'), assigneeId: pm.id },
    { projectId: otherId, title: 'Foreign excluded', effort: 8, assigneeId: pm.id },
  ] });
  const capacity = await database.projects.saveCapacity(projectId, pm.id, { userId: pm.id, periodStart: input.startDate, periodEnd: input.endDate, capacityPoints: 8, expectedUpdatedAt: null });
  await database.projects.saveCapacity(projectId, pm.id, { userId: member.id, periodStart: '2026-11-01', periodEnd: '2026-11-30', capacityPoints: 8, expectedUpdatedAt: null });
  const tasks = [selected, outside, unassigned].map((task) => ({ id: task.id, updatedAt: task.updatedAt.toISOString() }));
  const planning = { tasks, confirmed: false };
  const preview = await database.sprints.plan(projectId, pm.id, target.id, planning);
  const row = preview.workload.rows.find((item) => item.user.id === pm.id); assert.ok(row);
  assert.equal(row.sprintEffort, 8); assert.equal(row.sprintPercent, 100); assert.equal(row.sprintOverloaded, false);
  assert.equal(row.projectEffort, 13); assert.equal(row.projectPercent, 162.5); assert.equal(row.projectOverloaded, true);
  assert.equal(preview.workload.summary.knownEffort, 10); assert.equal(preview.workload.summary.missingEffortCount, 1); assert.equal(preview.workload.summary.unassignedCount, 1); assert.equal(preview.workload.summary.missingCapacityCount, 1); assert.equal(preview.capacityAvailable, false);
  assert.equal(preview.workload.rows.find((item) => item.user.id === member.id)?.sprintEffort, 2);
  assert.match(preview.warnings.join(' '), /ngày bắt đầu sau/);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: selected.id } })).sprintId, null);
  const path = `/projects/${projectId}/sprints/${target.id}/plan`;
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks, confirmed: true })).status, 409);
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks, confirmed: true, expectedSnapshot: 'invalid' })).status, 400);
  await database.projects.saveCapacity(projectId, pm.id, { userId: pm.id, periodStart: input.startDate, periodEnd: input.endDate, capacityPoints: 5, expectedUpdatedAt: capacity.updatedAt.toISOString() });
  await assert.rejects(database.sprints.plan(projectId, pm.id, target.id, { ...planning, confirmed: true, expectedSnapshot: preview.snapshot }), /đã thay đổi/);
  const afterCapacity = await database.sprints.plan(projectId, pm.id, target.id, planning);
  assert.equal(afterCapacity.workload.rows.find((item) => item.user.id === pm.id)?.sprintOverloaded, true);
  await client.task.update({ where: { id: otherWork.id }, data: { effort: 8 } });
  await assert.rejects(database.sprints.plan(projectId, pm.id, target.id, { ...planning, confirmed: true, expectedSnapshot: afterCapacity.snapshot }), /đã thay đổi/);
  const prerequisite = await client.task.create({ data: { projectId, title: 'Future dependency', startDate: new Date('2026-12-01') } });
  await client.taskDependency.create({ data: { projectId, taskId: selected.id, dependsOnTaskId: prerequisite.id } });
  const dependencyPreview = await database.sprints.plan(projectId, pm.id, target.id, planning);
  await client.task.update({ where: { id: prerequisite.id }, data: { status: 'DONE' } });
  await assert.rejects(database.sprints.plan(projectId, pm.id, target.id, { ...planning, confirmed: true, expectedSnapshot: dependencyPreview.snapshot }), /đã thay đổi/);
  const datePreview = await database.sprints.plan(projectId, pm.id, target.id, planning);
  await client.sprint.update({ where: { id: target.id }, data: { endDate: new Date('2026-10-24') } });
  await assert.rejects(database.sprints.plan(projectId, pm.id, target.id, { ...planning, confirmed: true, expectedSnapshot: datePreview.snapshot }), /đã thay đổi/);
  const latest = await database.sprints.plan(projectId, pm.id, target.id, planning);
  assert.equal(latest.workload.summary.missingCapacityCount, 2);
  assert.equal((await database.sprints.plan(projectId, pm.id, target.id, { ...planning, confirmed: true, expectedSnapshot: latest.snapshot })).applied, true);
}));

test('Sprint start rechecks capacity, backlog and dependency; monitor workload is PM-only and ignores Task filters', async () => fixture(async ({ base, client, database, projectId, users }) => {
  const [owner, pm, member] = users; assert.ok(owner && pm && member);
  const target = await database.sprints.create(projectId, pm.id, input);
  const task = await client.task.create({ data: { projectId, sprintId: target.id, title: 'Start commitment', effort: 5, assigneeId: member.id } });
  const prerequisite = await client.task.create({ data: { projectId, title: 'Dependency', startDate: new Date('2026-12-01') } });
  await client.taskDependency.create({ data: { projectId, taskId: task.id, dependsOnTaskId: prerequisite.id } });
  const read = () => database.sprints.start(projectId, pm.id, target.id, target.updatedAt.toISOString(), false);
  const confirm = (snapshot?: string) => database.sprints.start(projectId, pm.id, target.id, target.updatedAt.toISOString(), true, snapshot);
  const preview = await read(); assert.equal(preview.workload.summary.missingCapacityCount, 1);
  await assert.rejects(confirm(), /thiếu bản kiểm tra/);
  const cap = await database.projects.saveCapacity(projectId, pm.id, { userId: member.id, periodStart: input.startDate, periodEnd: input.endDate, capacityPoints: 3, expectedUpdatedAt: null });
  await assert.rejects(confirm(preview.snapshot), /đã thay đổi/);
  const afterCapacity = await read(); assert.equal(afterCapacity.workload.rows[0]?.sprintPercent, 166.67);
  await client.task.update({ where: { id: prerequisite.id }, data: { status: 'DONE' } });
  await assert.rejects(confirm(afterCapacity.snapshot), /đã thay đổi/);
  const beforeTask = await read();
  const second = await client.task.create({ data: { projectId, sprintId: target.id, title: 'Added after preview', effort: 3, assigneeId: member.id } });
  await assert.rejects(confirm(beforeTask.snapshot), /đã thay đổi/);
  assert.equal((await client.sprint.findUniqueOrThrow({ where: { id: target.id } })).status, 'PLANNED');
  assert.equal(await client.notification.count({ where: { type: 'SPRINT_STARTED', relatedEntityId: projectId } }), 0);
  const latest = await read(); assert.equal((await confirm(latest.snapshot)).applied, true);
  const pmMonitor = await database.sprints.monitor(projectId, pm.id, target.id, { page: 1, status: 'DONE' });
  assert.equal(pmMonitor.items.length, 0); assert.equal(pmMonitor.workload?.summary.knownEffort, 8); assert.equal(pmMonitor.workload?.summary.sprintOverloadedCount, 1);
  assert.equal((await database.sprints.monitor(projectId, member.id, target.id, { page: 1 })).workload, null);
  await client.task.update({ where: { id: second.id }, data: { status: 'DONE' } });
  await database.projects.saveCapacity(projectId, pm.id, { userId: member.id, periodStart: input.startDate, periodEnd: input.endDate, capacityPoints: 10, expectedUpdatedAt: cap.updatedAt.toISOString() });
  const refreshed = await database.sprints.monitor(projectId, pm.id, target.id, { page: 1 });
  assert.equal(refreshed.workload?.rows[0]?.sprintPercent, 50); assert.equal(refreshed.workload?.summary.sprintOverloadedCount, 0);
  const http = await (await request(base, `/projects/${projectId}/sprints/${target.id}/monitor`, member.cookie)).json() as { workload: unknown };
  assert.equal(http.workload, null);
}));

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
  const refreshed = await (await request(base, path, pm.cookie, 'POST', { tasks })).json() as { snapshot: string };
  assert.equal((await request(base, path, pm.cookie, 'POST', { tasks, confirmed: true, expectedSnapshot: refreshed.snapshot })).status, 200);
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
  const previews = await Promise.all([sprint, second].map((target) => database.sprints.plan(projectId, pm.id, target.id, { ...body, confirmed: false })));
  const responses = await Promise.all([sprint, second].map((target, index) => request(base, `/projects/${projectId}/sprints/${target.id}/plan`, pm.cookie, 'POST', { ...body, expectedSnapshot: previews[index]!.snapshot })));
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

test('UC47: only current PM starts a nonempty PLANNED Sprint, preview is read only and notifications persist once', async () => fixture(async ({ base, client, database, projectId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const path = `/projects/${projectId}/sprints/${sprint.id}/start`;
  const body = { expectedUpdatedAt: sprint.updatedAt.toISOString(), confirmed: true, expectedSnapshot: '0'.repeat(64) };
  assert.equal((await request(base, path, undefined, 'POST', body)).status, 401);
  for (const user of [owner, member, outsider, admin]) assert.equal((await request(base, path, user.cookie, 'POST', body)).status, 403);
  assert.equal((await request(base, path, pm.cookie, 'POST', body)).status, 409);
  await client.task.create({ data: { projectId, sprintId: sprint.id, title: 'Ready to start' } });
  assert.equal((await request(base, path, pm.cookie, 'POST', { ...body, expectedUpdatedAt: 'invalid' })).status, 400);
  assert.equal((await request(base, path, pm.cookie, 'POST', body, 'https://foreign.invalid')).status, 403);
  const preview = await request(base, path, pm.cookie, 'POST', { ...body, confirmed: false }); assert.equal(preview.status, 200);
  body.expectedSnapshot = (await preview.json() as { snapshot: string }).snapshot;
  assert.equal((await client.sprint.findUniqueOrThrow({ where: { id: sprint.id } })).status, 'PLANNED');
  assert.equal(await client.notification.count({ where: { type: 'SPRINT_STARTED', relatedEntityId: projectId } }), 0);
  const started = await request(base, path, pm.cookie, 'POST', body); assert.equal(started.status, 200);
  const saved = await client.sprint.findUniqueOrThrow({ where: { id: sprint.id } }); assert.equal(saved.status, 'ACTIVE'); assert.ok(saved.startedAt);
  assert.equal(await client.notification.count({ where: { type: 'SPRINT_STARTED', relatedEntityId: projectId } }), 2);
  assert.equal((await request(base, path, pm.cookie, 'POST', body)).status, 409);
  assert.equal(await client.notification.count({ where: { type: 'SPRINT_STARTED', relatedEntityId: projectId } }), 2);
  const second = await database.sprints.create(projectId, pm.id, { ...input, name: 'Next' });
  await client.task.create({ data: { projectId, sprintId: second.id, title: 'Next Task' } });
  assert.equal((await request(base, `/projects/${projectId}/sprints/${second.id}/start`, pm.cookie, 'POST', { expectedUpdatedAt: second.updatedAt.toISOString(), confirmed: true })).status, 409);
  await assert.rejects(database.projects.close(projectId, pm.id), /Task chưa DONE/);
  await client.task.updateMany({ where: { projectId }, data: { status: 'DONE' } });
  await assert.rejects(database.projects.close(projectId, pm.id), /Sprint ACTIVE/);
}));

test('UC48: Project membership, complete Sprint summary, filters, pagination and Vietnam date boundaries', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const dependency = await client.task.create({ data: { projectId, title: 'Prerequisite' } });
  const blocked = await client.task.create({ data: { projectId, sprintId: sprint.id, title: 'Blocked task', status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: member.id, dueDate: new Date('2026-10-10') } });
  const done = await client.task.create({ data: { projectId, sprintId: sprint.id, title: 'Done task', status: 'DONE', dueDate: new Date('2026-10-01') } });
  for (const task of [blocked, done]) await client.taskDependency.create({ data: { projectId, taskId: task.id, dependsOnTaskId: dependency.id } });
  await client.task.createMany({ data: Array.from({ length: 20 }, (_, index) => ({ projectId, sprintId: sprint.id, title: `TODO ${index}`, dueDate: new Date('2026-10-11') })) });
  const now = new Date('2026-10-10T18:00:00Z');
  const filtered = await database.sprints.monitor(projectId, member.id, sprint.id, { page: 1, status: 'DONE' }, now);
  assert.equal(filtered.total, 1); assert.equal(filtered.items.length, 1); assert.equal(filtered.summary.total, 22);
  assert.deepEqual(filtered.summary.counts, { TODO: 20, IN_PROGRESS: 1, REVIEW: 0, DONE: 1 });
  assert.equal(filtered.summary.progressPercent, 5); assert.equal(filtered.summary.today, '2026-10-11'); assert.equal(filtered.summary.daysRemaining, 14);
  assert.equal(filtered.summary.blocked, 1); assert.equal(filtered.summary.overdue, 1); assert.equal(filtered.items[0]!.blocked, false); assert.equal(filtered.items[0]!.overdue, false);
  const first = await database.sprints.monitor(projectId, member.id, sprint.id, { page: 1 }, now); assert.equal(first.items.length, 20);
  const second = await database.sprints.monitor(projectId, member.id, sprint.id, { page: 2 }, now); assert.equal(second.items.length, 2);
  const assigned = await database.sprints.monitor(projectId, member.id, sprint.id, { page: 1, assigneeId: member.id, priority: 'HIGH' }, now); assert.equal(assigned.total, 1); assert.equal(assigned.items[0]!.blocked, true); assert.equal(assigned.assignees[0]!.id, member.id);
  await client.task.update({ where: { id: dependency.id }, data: { status: 'DONE' } });
  assert.equal((await database.sprints.monitor(projectId, member.id, sprint.id, { page: 1 }, now)).summary.blocked, 0);
  const path = `/projects/${projectId}/sprints/${sprint.id}/monitor`;
  assert.equal((await request(base, path)).status, 401);
  for (const user of [owner, outsider, admin]) assert.equal((await request(base, path, user.cookie)).status, 403);
  assert.equal((await request(base, path, member.cookie)).status, 200);
  assert.equal((await request(base, `${path}?status=BLOCKED`, member.cookie)).status, 400);
  assert.equal((await request(base, `${path}?page=0`, member.cookie)).status, 400);
  const foreign = await client.sprint.create({ data: { projectId: otherId, name: 'Private', goal: 'Private goal', startDate: new Date(input.startDate), endDate: new Date(input.endDate) } });
  assert.equal((await request(base, `/projects/${projectId}/sprints/${foreign.id}/monitor`, member.cookie)).status, 404);
}));

test('concurrent Sprint starts and Project closing are serialized; old PM cannot start after transfer', async () => fixture(async ({ client, database, projectId, users }) => {
  const [owner, pm, member] = users; assert.ok(owner && pm && member);
  const sprints = await Promise.all(['A', 'B'].map((name) => database.sprints.create(projectId, pm.id, { ...input, name })));
  for (const sprint of sprints) await client.task.create({ data: { projectId, sprintId: sprint.id, title: sprint.name, status: 'DONE' } });
  const results = await Promise.allSettled(sprints.map((sprint) => confirmStart(database.sprints, projectId, pm.id, sprint)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await client.sprint.count({ where: { projectId, status: 'ACTIVE' } }), 1);
  const active = await client.sprint.findFirstOrThrow({ where: { projectId, status: 'ACTIVE' } });
  await client.sprint.update({ where: { id: active.id }, data: { status: 'COMPLETED' } });
  const planned = await client.sprint.findFirstOrThrow({ where: { projectId, status: 'PLANNED' } });
  await database.projects.assignManager(projectId, owner.id, member.id, pm.id);
  await assert.rejects(database.sprints.start(projectId, pm.id, planned.id, planned.updatedAt.toISOString(), true), /Chỉ PM hiện tại/);
  const preview = await database.sprints.start(projectId, member.id, planned.id, planned.updatedAt.toISOString(), false);
  const race = await Promise.allSettled([database.sprints.start(projectId, member.id, planned.id, planned.updatedAt.toISOString(), true, preview.snapshot), database.projects.close(projectId, member.id)]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
  const project = await client.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(await client.sprint.count({ where: { projectId, status: 'ACTIVE' } }), project.status === 'CLOSED' ? 0 : 1);
}));

test('failed Sprint notification rolls back ACTIVE and startedAt together', async () => fixture(async ({ client, database, projectId, users }) => {
  const pm = users[1]!; const sprint = await database.sprints.create(projectId, pm.id, input);
  await client.task.create({ data: { projectId, sprintId: sprint.id, title: 'Rollback start' } });
  const wrapped = { $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => client.$transaction((tx) => operation(new Proxy(tx, { get(target, key) {
    if (key === 'notification') return new Proxy(target.notification, { get(delegate, action) { if (action === 'create') return async () => { throw new Error('Injected notification failure'); }; return Reflect.get(delegate, action); } });
    return Reflect.get(target, key);
  } }))) } as unknown as PrismaClient;
  const preview = await database.sprints.start(projectId, pm.id, sprint.id, sprint.updatedAt.toISOString(), false);
  await assert.rejects(createSprintRepository(wrapped).start(projectId, pm.id, sprint.id, sprint.updatedAt.toISOString(), true, preview.snapshot), /Injected/);
  const saved = await client.sprint.findUniqueOrThrow({ where: { id: sprint.id } }); assert.equal(saved.status, 'PLANNED'); assert.equal(saved.startedAt, null);
  assert.equal(await client.notification.count({ where: { relatedEntityId: projectId, type: 'SPRINT_STARTED' } }), 0);
}));

test('UC52: preview, stale snapshot, transfer, history, permissions and atomic completion', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const source = await database.sprints.create(projectId, pm.id, input);
  const destination = await database.sprints.create(projectId, pm.id, { ...input, name: 'Next' });
  await client.sprint.update({ where: { id: source.id }, data: { status: 'ACTIVE' } });
  const done = await client.task.create({ data: { projectId, sprintId: source.id, title: 'Done', status: 'DONE' } });
  const pending = await client.task.create({ data: { projectId, sprintId: source.id, title: 'Pending', status: 'REVIEW' } });
  const path = `/projects/${projectId}/sprints/${source.id}`;
  assert.equal((await request(base, `${path}/finish-preview`, undefined, 'POST', {})).status, 401);
  for (const user of [owner, member, outsider, admin]) assert.equal((await request(base, `${path}/finish-preview`, user.cookie, 'POST', {})).status, 403);
  const preview = await database.sprints.finishPreview(projectId, pm.id, source.id);
  assert.equal(preview.doneCount, 1); assert.equal(preview.incompleteCount, 1);
  const data = { expectedSnapshot: preview.snapshot, destinationSprintId: destination.id, confirmed: true };
  assert.equal((await request(base, `${path}/finish`, pm.cookie, 'POST', data, 'https://foreign.invalid')).status, 403);
  assert.equal((await request(base, `${path}/finish`, member.cookie, 'POST', data)).status, 403);
  assert.equal((await database.sprints.finish(projectId, pm.id, source.id, { ...data, confirmed: false })).applied, false);
  assert.equal((await client.sprint.findUniqueOrThrow({ where: { id: source.id } })).status, 'ACTIVE');
  await client.task.update({ where: { id: pending.id }, data: { title: 'Changed' } });
  assert.equal((await request(base, `${path}/finish`, pm.cookie, 'POST', data)).status, 409);
  const refreshed = await database.sprints.finishPreview(projectId, pm.id, source.id);
  const cross = await client.sprint.create({ data: { projectId: otherId, name: 'Other', goal: 'x', startDate: source.startDate, endDate: source.endDate } });
  assert.equal((await request(base, `${path}/finish`, pm.cookie, 'POST', { ...data, expectedSnapshot: refreshed.snapshot, destinationSprintId: cross.id })).status, 404);
  const wrapped = { $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => client.$transaction((tx) => operation(new Proxy(tx, { get(target, key) {
    if (key === 'notification') return new Proxy(target.notification, { get(delegate, action) { if (action === 'createMany') return async () => { throw new Error('Injected completion failure'); }; return Reflect.get(delegate, action); } });
    return Reflect.get(target, key);
  } }))) } as unknown as PrismaClient;
  await assert.rejects(createSprintRepository(wrapped).finish(projectId, pm.id, source.id, { ...data, expectedSnapshot: refreshed.snapshot }), /Injected/);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: pending.id } })).sprintId, source.id);
  const race = await Promise.allSettled([database.sprints.finish(projectId, pm.id, source.id, { ...data, expectedSnapshot: refreshed.snapshot }), database.sprints.finish(projectId, pm.id, source.id, { ...data, expectedSnapshot: refreshed.snapshot })]);
  assert.equal(race.filter((item) => item.status === 'fulfilled').length, 1);
  const completed = await client.sprint.findUniqueOrThrow({ where: { id: source.id } });
  assert.equal(completed.status, 'COMPLETED'); assert.ok(completed.completedAt); assert.ok(completed.completion);
  const moved = await client.task.findUniqueOrThrow({ where: { id: pending.id } }); assert.equal(moved.sprintId, destination.id); assert.equal(moved.status, 'REVIEW');
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: done.id } })).sprintId, source.id);
  assert.equal(await client.notification.count({ where: { type: 'SPRINT_COMPLETED', relatedEntityId: projectId } }), 2);
  await client.sprint.update({ where: { id: destination.id }, data: { status: 'ACTIVE' } });
  const nextPreview = await database.sprints.finishPreview(projectId, pm.id, destination.id);
  await database.sprints.finish(projectId, pm.id, destination.id, { expectedSnapshot: nextPreview.snapshot, destinationSprintId: null, confirmed: true });
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: pending.id } })).sprintId, null);
}));

test('UC51: shared member/PM retrospective, stale edits, scope and retained history', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const path = `/projects/${projectId}/sprints/${sprint.id}/retrospective`;
  const draft = { wentWell: 'Phối hợp tốt', needsImprovement: 'Review sớm hơn', actionItems: 'Review mỗi ngày', expectedUpdatedAt: null };
  assert.equal((await request(base, path)).status, 401);
  for (const user of [owner, outsider, admin]) {
    assert.equal((await request(base, path, user.cookie)).status, 403);
    assert.equal((await request(base, path, user.cookie, 'PUT', draft)).status, 403);
  }
  for (const bad of [{ ...draft, wentWell: ' ' }, { ...draft, needsImprovement: '' }, { ...draft, actionItems: 'x'.repeat(4001) }, { ...draft, authorId: pm.id }]) assert.equal((await request(base, path, member.cookie, 'PUT', bad)).status, 400);
  assert.equal((await request(base, path, member.cookie, 'PUT', draft, 'https://foreign.invalid')).status, 403);
  const created = await request(base, path, member.cookie, 'PUT', draft); assert.equal(created.status, 200);
  const record = await created.json() as { id: string; updatedAt: string; author: { id: string } };
  assert.equal(record.author.id, member.id);
  const shared = await (await request(base, path, pm.cookie)).json() as { canEdit: boolean; retrospective: { actionItems: string } };
  assert.equal(shared.canEdit, true); assert.equal(shared.retrospective.actionItems, draft.actionItems);
  const update = { ...draft, expectedUpdatedAt: record.updatedAt, actionItems: 'Cải tiến Sprint sau' };
  const race = await Promise.all([request(base, path, pm.cookie, 'PUT', update), request(base, path, member.cookie, 'PUT', update)]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const saved = await client.sprintRetrospective.findUniqueOrThrow({ where: { sprintId: sprint.id } });
  assert.equal(saved.id, record.id); assert.equal(saved.actionItems, update.actionItems);
  assert.equal(await client.sprintRetrospective.count({ where: { sprintId: sprint.id } }), 1);
  await database.projects.removeMember(projectId, pm.id, member.id);
  assert.equal((await request(base, path, member.cookie, 'PUT', { ...draft, expectedUpdatedAt: saved.updatedAt.toISOString() })).status, 403);
  assert.equal((await request(base, `/projects/${otherId}/sprints/${sprint.id}/retrospective`, pm.cookie, 'PUT', draft)).status, 403);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'COMPLETED' } });
  assert.equal((await request(base, path, pm.cookie, 'PUT', draft)).status, 409);
  const history = await (await request(base, path, pm.cookie)).json() as { canEdit: boolean; retrospective: { id: string } };
  assert.equal(history.canEdit, false); assert.equal(history.retrospective.id, record.id);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'PLANNED' } });
  await database.projects.close(projectId, pm.id);
  assert.equal((await request(base, path, pm.cookie, 'PUT', draft)).status, 409);
  await assert.rejects(client.sprintRetrospective.update({ where: { id: saved.id }, data: { actionItems: '' } }));
}));

test('UC50: current PM, one Review, saved counts, stale writes and completed history', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const path = `/projects/${projectId}/sprints/${sprint.id}/review`;
  const draft = { summary: 'Kết quả Sprint', feedback: 'Cần cải thiện trải nghiệm', expectedUpdatedAt: null };
  assert.equal((await request(base, path)).status, 401);
  for (const user of [owner, outsider, admin]) assert.equal((await request(base, path, user.cookie)).status, 403);
  for (const user of [owner, member, outsider, admin]) assert.equal((await request(base, path, user.cookie, 'PUT', draft)).status, 403);
  assert.equal((await request(base, path, pm.cookie, 'PUT', draft, 'https://foreign.invalid')).status, 403);
  for (const bad of [{ ...draft, summary: ' ' }, { ...draft, feedback: '' }, { ...draft, feedback: 'a'.repeat(4001) }, { ...draft, authorId: member.id }, { summary: 'x', feedback: 'y' }]) assert.equal((await request(base, path, pm.cookie, 'PUT', bad)).status, 400);
  await client.task.createMany({ data: [{ projectId, sprintId: sprint.id, title: 'Done', status: 'DONE' }, { projectId, sprintId: sprint.id, title: 'Pending' }] });
  const created = await request(base, path, pm.cookie, 'PUT', draft); assert.equal(created.status, 200);
  const review = await created.json() as { id: string; updatedAt: string; doneCount: number; incompleteCount: number };
  assert.equal(review.doneCount, 1); assert.equal(review.incompleteCount, 1);
  assert.equal((await request(base, path, pm.cookie, 'PUT', draft)).status, 409);
  await client.task.updateMany({ where: { projectId }, data: { status: 'DONE' } });
  const loaded = await (await request(base, path, member.cookie)).json() as { review: { doneCount: number }; current: { doneCount: number }; canEdit: boolean };
  assert.equal(loaded.review.doneCount, 1); assert.equal(loaded.current.doneCount, 2); assert.equal(loaded.canEdit, false);
  const update = { ...draft, expectedUpdatedAt: review.updatedAt, summary: 'Updated' };
  const race = await Promise.all([request(base, path, pm.cookie, 'PUT', update), request(base, path, pm.cookie, 'PUT', update)]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const saved = await client.sprintReview.findUniqueOrThrow({ where: { sprintId: sprint.id } });
  assert.equal(saved.id, review.id); assert.equal(saved.doneCount, 2); assert.equal(saved.incompleteCount, 0);
  assert.equal(await client.sprintReview.count({ where: { sprintId: sprint.id } }), 1);
  assert.equal((await request(base, `/projects/${otherId}/sprints/${sprint.id}/review`, owner.cookie, 'PUT', draft)).status, 403);
  await database.projects.assignManager(projectId, owner.id, member.id, pm.id);
  assert.equal((await request(base, path, pm.cookie, 'PUT', { ...draft, expectedUpdatedAt: saved.updatedAt.toISOString() })).status, 403);
  assert.equal((await request(base, path, member.cookie, 'PUT', { ...draft, expectedUpdatedAt: saved.updatedAt.toISOString() })).status, 200);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'COMPLETED' } });
  assert.equal((await request(base, path, member.cookie, 'PUT', draft)).status, 409);
  assert.equal((await request(base, path, member.cookie)).status, 200);
  await assert.rejects(client.sprintReview.create({ data: { sprintId: sprint.id, authorId: member.id, summary: 'Duplicate', feedback: 'x', doneCount: 0, incompleteCount: 0 } }));
}));

test('UC49: member updates, append-only history, scope, ACTIVE and pagination', async () => fixture(async ({ base, client, database, projectId, otherId, users }) => {
  const [owner, pm, member, outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const sprint = await database.sprints.create(projectId, pm.id, input);
  const path = `/projects/${projectId}/sprints/${sprint.id}/daily`;
  const update = { progress: 'Đã làm API', nextPlan: 'Kiểm thử', blockers: '' };
  assert.equal((await request(base, path)).status, 401);
  for (const user of [owner, outsider, admin]) {
    assert.equal((await request(base, path, user.cookie)).status, 403);
    assert.equal((await request(base, path, user.cookie, 'POST', update)).status, 403);
  }
  assert.equal((await request(base, path, member.cookie, 'POST', update)).status, 409);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'ACTIVE' } });
  for (const bad of [{ ...update, progress: ' ' }, { ...update, nextPlan: '' }, { ...update, authorId: pm.id }, { ...update, blockers: 'a'.repeat(2001) }]) assert.equal((await request(base, path, member.cookie, 'POST', bad)).status, 400);
  assert.equal((await request(base, path, member.cookie, 'POST', update, 'https://foreign.invalid')).status, 403);
  for (const user of [member, member, pm]) assert.equal((await request(base, path, user.cookie, 'POST', update)).status, 201);
  const history = await (await request(base, path, member.cookie)).json() as { total: number; items: { author: { id: string }; progress: string }[] };
  assert.equal(history.total, 3); assert.equal(history.items.filter((item) => item.author.id === member.id).length, 2); assert.equal(history.items[0]!.progress, update.progress);
  assert.equal((await request(base, `/projects/${otherId}/sprints/${sprint.id}/daily`, owner.cookie)).status, 403);
  await client.dailyUpdate.createMany({ data: Array.from({ length: 20 }, () => ({ sprintId: sprint.id, authorId: member.id, ...update })) });
  const second = await (await request(base, `${path}?page=2`, member.cookie)).json() as { total: number; items: unknown[] };
  assert.equal(second.total, 23); assert.equal(second.items.length, 3);
  assert.equal((await request(base, `${path}?page=0`, member.cookie)).status, 400);
  await client.sprint.update({ where: { id: sprint.id }, data: { status: 'COMPLETED' } });
  assert.equal((await request(base, path, member.cookie, 'POST', update)).status, 409);
  assert.equal((await request(base, path, member.cookie)).status, 200);
  await assert.rejects(client.dailyUpdate.create({ data: { sprintId: sprint.id, authorId: member.id, ...update, progress: '' } }));
}));
