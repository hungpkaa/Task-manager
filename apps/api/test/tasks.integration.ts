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
function upload(base: string, taskId: string, user: UserFixture | undefined, bytes: Buffer, filename = 'report.txt', extraHeaders: Record<string, string> = {}) {
  return fetch(`${base}/api/tasks/${taskId}/attachments`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(filename), ...(user ? { Cookie: user.cookie } : {}), ...extraHeaders }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(15_000) });
}

test('UC36: scope, cycles, concurrent additions, BLOCKED and dependency removal', async () => fixture(async ({ base, client, projectId, otherProjectId, users }) => {
  const [owner, pm, assignee, member, outsider, admin] = users; assert.ok(owner && pm && assignee && member && outsider && admin);
  const a = await create(base, projectId, pm); const b = await create(base, projectId, pm); const c = await create(base, projectId, pm);
  const foreign = await client.task.create({ data: { projectId: otherProjectId, title: 'Foreign' } });
  const path = `/tasks/${a.id}/dependencies`;
  assert.equal((await request(base, path)).status, 401);
  for (const user of [owner, member, assignee]) assert.equal((await request(base, path, user)).status, 200);
  for (const user of [outsider, admin]) assert.equal((await request(base, path, user)).status, 403);
  for (const user of [owner, member, assignee, outsider, admin]) assert.equal((await request(base, path, user, 'POST', { dependsOnTaskId: b.id })).status, 403);
  for (const id of [a.id, foreign.id, randomUUID(), 'invalid']) assert.equal((await request(base, path, pm, 'POST', { dependsOnTaskId: id })).status, 400);
  assert.equal((await request(base, path, pm, 'POST', { dependsOnTaskId: b.id })).status, 201);
  assert.equal((await request(base, path, pm, 'POST', { dependsOnTaskId: b.id })).status, 409);
  assert.equal((await request(base, `/tasks/${b.id}/dependencies`, pm, 'POST', { dependsOnTaskId: c.id })).status, 201);
  assert.equal((await request(base, `/tasks/${c.id}/dependencies`, pm, 'POST', { dependsOnTaskId: a.id })).status, 409);
  const blocked = await (await request(base, `/tasks/${a.id}`, member)).json() as { task: { blocked: boolean; status: string } };
  assert.equal(blocked.task.blocked, true); assert.equal(blocked.task.status, 'TODO');
  await client.task.update({ where: { id: b.id }, data: { status: 'DONE' } });
  assert.equal((await (await request(base, `/tasks/${a.id}`, member)).json() as { task: { blocked: boolean } }).task.blocked, false);
  assert.equal((await request(base, `${path}/${b.id}`, member, 'DELETE', {})).status, 403);
  assert.equal((await request(base, `${path}/${b.id}`, pm, 'DELETE', {})).status, 204);
  assert.equal((await request(base, `${path}/${b.id}`, pm, 'DELETE', {})).status, 404);
  const race = await Promise.all([request(base, `/tasks/${a.id}/dependencies`, pm, 'POST', { dependsOnTaskId: c.id }), request(base, `/tasks/${c.id}/dependencies`, pm, 'POST', { dependsOnTaskId: a.id })]);
  assert.deepEqual(race.map((item) => item.status).sort(), [201, 409]);
  const extras = await Promise.all(Array.from({ length: 21 }, (_, index) => client.task.create({ data: { projectId, title: `Dependency ${index}` } })));
  await client.taskDependency.createMany({ data: extras.map((task) => ({ taskId: b.id, dependsOnTaskId: task.id, projectId })) });
  const page = await (await request(base, `/tasks/${b.id}/dependencies?page=2`, pm)).json() as { items: unknown[]; total: number };
  assert.equal(page.total, 22); assert.equal(page.items.length, 2);
  const version = await client.task.findUniqueOrThrow({ where: { id: a.id } });
  await client.project.update({ where: { id: projectId }, data: { status: 'CLOSED' } });
  assert.equal((await request(base, path, pm, 'POST', { dependsOnTaskId: b.id })).status, 409);
  const history = await (await request(base, path, pm)).json() as { canEdit: boolean }; assert.equal(history.canEdit, false);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: a.id } })).updatedAt.toISOString(), version.updatedAt.toISOString());
}));

test('UC19: create directly in planned/active Sprint, backlog default and invalid Sprint rejection', async () => fixture(async ({ base, client, projectId, otherProjectId, users }) => {
  const [owner, pm, assignee, member, outsider, admin] = users; assert.ok(owner && pm && assignee && member && outsider && admin);
  const fields = { name: 'Task Sprint', goal: 'Test creation', startDate: new Date('2026-10-11'), endDate: new Date('2026-10-25') };
  const planned = await client.sprint.create({ data: { projectId, ...fields } });
  const active = await client.sprint.create({ data: { projectId, ...fields, status: 'ACTIVE' } });
  const completed = await client.sprint.create({ data: { projectId, ...fields, status: 'COMPLETED' } });
  const other = await client.sprint.create({ data: { projectId: otherProjectId, ...fields } });
  const path = `/projects/${projectId}/tasks`;
  for (const sprintId of [undefined, null, planned.id, active.id]) {
    const task = await create(base, projectId, pm, { ...(sprintId !== undefined ? { sprintId } : {}), assigneeId: assignee.id });
    assert.equal(task.sprintId, sprintId ?? null); assert.equal(task.status, 'TODO');
    assert.equal(await client.notification.count({ where: { relatedEntityId: task.id, userId: assignee.id } }), 1);
  }
  const count = await client.task.count({ where: { projectId } });
  for (const [sprintId, status] of [[completed.id, 409], [other.id, 400], [randomUUID(), 400], ['invalid', 400]] as const) assert.equal((await request(base, path, pm, 'POST', { title: 'Rejected', sprintId })).status, status);
  for (const user of [owner, assignee, member, outsider, admin]) assert.equal((await request(base, path, user, 'POST', { title: 'Forbidden', sprintId: planned.id })).status, 403);
  assert.equal(await client.task.count({ where: { projectId } }), count);
  const task = await create(base, projectId, pm, { sprintId: planned.id });
  assert.equal((await request(base, `/tasks/${task.id}`, pm, 'PATCH', { sprintId: active.id })).status, 400);
  await client.sprint.update({ where: { id: planned.id }, data: { status: 'COMPLETED' } });
  assert.equal((await request(base, path, pm, 'POST', { title: 'Stale selection', sprintId: planned.id })).status, 409);
  await client.project.update({ where: { id: projectId }, data: { status: 'CLOSED' } });
  assert.equal((await request(base, path, pm, 'POST', { title: 'Closed', sprintId: active.id })).status, 409);
}));

test('UC26: attachment bytes persist, metadata excludes data, downloads and deletion enforce Task scope', async () => fixture(async ({ base, client, projectId, otherProjectId, users }) => {
  const [owner, pm, member, peer, outsider, admin] = users; assert.ok(owner && pm && member && peer && outsider && admin);
  const task = await create(base, projectId, pm); const path = `/tasks/${task.id}/attachments`;
  const bytes = Buffer.from('Báo cáo nhóm\nNội dung thử nghiệm\n');
  const response = await upload(base, task.id, member, bytes, 'báo cáo.txt'); assert.equal(response.status, 201);
  const saved = await response.json() as { attachment: { id: string; uploadedBy: string; filename: string; sizeBytes: number; data?: unknown } };
  assert.equal(saved.attachment.uploadedBy, member.id); assert.equal(saved.attachment.filename, 'báo cáo.txt'); assert.equal(saved.attachment.sizeBytes, bytes.length); assert.equal(saved.attachment.data, undefined);
  const listed = await (await request(base, path, peer)).json() as { items: { id: string; data?: unknown; canDelete: boolean }[]; canUpload: boolean };
  assert.equal(listed.items.length, 1); assert.equal(listed.items[0]!.data, undefined); assert.equal(listed.items[0]!.canDelete, false); assert.equal(listed.canUpload, true);
  const downloadPath = `${path}/${saved.attachment.id}/download`;
  const download = await request(base, downloadPath, peer); assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.equal(download.headers.get('content-type'), 'application/octet-stream'); assert.match(download.headers.get('content-disposition')!, /^attachment;/); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.equal(download.headers.get('cache-control'), 'no-store');
  for (const user of [outsider, admin]) { assert.equal((await request(base, path, user)).status, 403); assert.equal((await request(base, downloadPath, user)).status, 403); }
  assert.equal((await request(base, downloadPath)).status, 401);
  assert.equal((await request(base, downloadPath, owner)).status, 200);
  const differentTask = await client.task.create({ data: { projectId: otherProjectId, title: 'Other private task' } });
  assert.equal((await request(base, `/tasks/${differentTask.id}/attachments/${saved.attachment.id}/download`, owner)).status, 404);
  for (const user of [owner, peer]) assert.equal((await request(base, `${path}/${saved.attachment.id}`, user, 'DELETE', {})).status, 403);
  assert.equal((await request(base, `${path}/${saved.attachment.id}`, pm, 'DELETE', {})).status, 204);
  assert.equal((await request(base, downloadPath, peer)).status, 404);
  const own = await upload(base, task.id, member, bytes); assert.equal(own.status, 201);
  const ownId = (await own.json() as { attachment: { id: string } }).attachment.id;
  assert.equal((await request(base, `${path}/${ownId}`, member, 'DELETE', {})).status, 204);
  assert.equal(await client.attachment.count({ where: { taskId: task.id } }), 0);
}));

test('attachment upload rejects invalid filenames, sizes, origins, encodings and nonmembers without storing bytes', async () => fixture(async ({ base, client, projectId, users }) => {
  const [owner, pm, member, , outsider, admin] = users; assert.ok(owner && pm && member && outsider && admin);
  const task = await create(base, projectId, pm); const bytes = Buffer.from('fixture');
  for (const user of [owner, outsider, admin]) assert.equal((await upload(base, task.id, user, bytes)).status, 403);
  assert.equal((await upload(base, task.id, undefined, bytes)).status, 401);
  assert.equal((await upload(base, task.id, member, bytes, 'ok.txt', { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await upload(base, task.id, member, bytes, 'ok.txt', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await upload(base, task.id, member, bytes, 'ok.txt', { 'Content-Encoding': 'gzip' })).status, 415);
  for (const filename of ['../report.txt', 'folder\\report.txt', 'bad\n.txt', '.hidden.txt', 'run.exe', 'page.html', 'x'.repeat(256) + '.txt']) assert.equal((await upload(base, task.id, member, bytes, filename)).status, 400);
  assert.equal((await upload(base, task.id, member, bytes, 'ok.txt', { 'X-Filename': '%broken' })).status, 400);
  assert.equal((await upload(base, task.id, member, Buffer.alloc(0))).status, 400);
  assert.equal((await upload(base, task.id, member, Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
  assert.equal(await client.attachment.count({ where: { taskId: task.id } }), 0);
  await assert.rejects(client.attachment.create({ data: { taskId: task.id, uploadedBy: member.id, filename: 'empty.txt', sizeBytes: 0, data: new Uint8Array() } }));
  await assert.rejects(client.attachment.create({ data: { taskId: task.id, uploadedBy: member.id, filename: 'mismatch.txt', sizeBytes: 2, data: new Uint8Array([1]) } }));
}));

test('attachments are serialized with member removal, retained on closed Projects and cascade with Task deletion', async () => fixture(async ({ base, client, projectId, users }) => {
  const [, pm, member, peer] = users; assert.ok(pm && member && peer);
  const task = await create(base, projectId, pm);
  const [uploaded, removed] = await Promise.all([upload(base, task.id, member, Buffer.from('Race')), request(base, `/projects/${projectId}/members/${member.id}`, pm, 'DELETE', {})]);
  assert.equal(removed.status, 204); assert.ok([201, 403].includes(uploaded.status));
  assert.equal(await client.attachment.count({ where: { taskId: task.id } }), uploaded.status === 201 ? 1 : 0);
  assert.equal((await request(base, `/tasks/${task.id}/attachments`, member)).status, 403);
  const saved = await upload(base, task.id, peer, Buffer.from('Retained')); assert.equal(saved.status, 201);
  const attachmentId = (await saved.json() as { attachment: { id: string } }).attachment.id;
  await client.task.update({ where: { id: task.id }, data: { status: 'DONE' } });
  assert.equal((await request(base, `/projects/${projectId}/close`, pm, 'POST', {})).status, 200);
  assert.equal((await upload(base, task.id, peer, Buffer.from('Closed'))).status, 409);
  assert.equal((await request(base, `/tasks/${task.id}/attachments/${attachmentId}`, peer, 'DELETE', {})).status, 409);
  assert.equal((await request(base, `/tasks/${task.id}/attachments/${attachmentId}/download`, peer)).status, 200);
  await client.task.delete({ where: { id: task.id } });
  assert.equal(await client.attachment.count({ where: { taskId: task.id } }), 0);
}));

test('UC25: comments and unique mention notifications persist; permissions and closed Project are enforced', async () => fixture(async ({ base, client, projectId, users }) => {
  const [owner, pm, member, target, outsider, admin] = users; assert.ok(owner && pm && member && target && outsider && admin);
  const task = await create(base, projectId, pm); const path = `/tasks/${task.id}/comments`;
  const email = (await client.user.findUniqueOrThrow({ where: { id: target.id } })).email;
  const body = `Xin kiểm tra @{${email}} @{${email.toUpperCase()}} <script>alert(1)</script>`;
  const response = await request(base, path, member, 'POST', { body }); assert.equal(response.status, 201);
  const saved = await response.json() as { comment: { id: string; body: string; authorId: string; mentions: unknown[] } };
  assert.equal(saved.comment.authorId, member.id); assert.equal(saved.comment.body, body); assert.equal(saved.comment.mentions.length, 1);
  assert.equal(await client.commentMention.count({ where: { commentId: saved.comment.id } }), 1);
  assert.equal(await client.notification.count({ where: { userId: target.id, type: 'COMMENT_MENTION', relatedEntityId: task.id } }), 1);
  const ownEmail = (await client.user.findUniqueOrThrow({ where: { id: member.id } })).email;
  assert.equal((await request(base, path, member, 'POST', { body: `@{${ownEmail}}` })).status, 201);
  assert.equal(await client.notification.count({ where: { userId: member.id, type: 'COMMENT_MENTION' } }), 0);
  for (const user of [owner, outsider, admin]) assert.equal((await request(base, path, user, 'POST', { body: 'Forbidden' })).status, 403);
  for (const user of [outsider, admin]) assert.equal((await request(base, path, user)).status, 403);
  assert.equal((await request(base, path)).status, 401);
  for (const input of [{ body: ' ' }, { body: 'x'.repeat(5001) }, { body: 'Forged', authorId: pm.id }, { body: '@{missing@example.invalid}' }]) assert.equal((await request(base, path, member, 'POST', input)).status, 400);
  const outsideEmail = (await client.user.findUniqueOrThrow({ where: { id: outsider.id } })).email;
  assert.equal((await request(base, path, member, 'POST', { body: `@{${outsideEmail}}` })).status, 400);
  await client.user.update({ where: { id: target.id }, data: { status: 'LOCKED' } });
  assert.equal((await request(base, path, member, 'POST', { body: `@{${email}}` })).status, 400);
  assert.equal(await client.comment.count({ where: { taskId: task.id } }), 2);
  await client.task.update({ where: { id: task.id }, data: { status: 'DONE' } });
  assert.equal((await request(base, `/projects/${projectId}/close`, pm, 'POST', {})).status, 200);
  assert.equal((await request(base, path, member, 'POST', { body: 'Closed' })).status, 409);
  const list = await (await request(base, path, owner)).json() as { items: unknown[]; canPost: boolean };
  assert.equal(list.items.length, 2); assert.equal(list.canPost, false);
}));

test('comments paginate, retain author history and roll back completely when notification creation fails', async () => fixture(async ({ base, client, projectId, users }) => {
  const [, pm, member, target] = users; assert.ok(pm && member && target);
  const task = await create(base, projectId, pm);
  await client.comment.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ taskId: task.id, authorId: member.id, body: `History ${index}`, createdAt: new Date(1700000000000 + index) })) });
  const first = await (await request(base, `/tasks/${task.id}/comments`, pm)).json() as { items: { body: string }[]; total: number };
  assert.equal(first.items.length, 20); assert.equal(first.total, 21); assert.equal(first.items[0]!.body, 'History 20');
  const second = await (await request(base, `/tasks/${task.id}/comments?page=2`, pm)).json() as { items: { body: string }[] };
  assert.equal(second.items.length, 1); assert.equal(second.items[0]!.body, 'History 0');
  const wrapped = { $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => client.$transaction((tx) => operation(new Proxy(tx, { get(txTarget, key) {
    if (key === 'notification') return new Proxy(txTarget.notification, { get(delegate, action) { if (action === 'create') return async () => { throw new Error('Injected notification failure'); }; return Reflect.get(delegate, action); } });
    return Reflect.get(txTarget, key);
  } }))), task: client.task } as unknown as PrismaClient;
  const email = (await client.user.findUniqueOrThrow({ where: { id: target.id } })).email;
  await assert.rejects(createTaskRepository(wrapped).addComment(task.id, member.id, `@{${email}}`), /Injected/);
  assert.equal(await client.comment.count({ where: { taskId: task.id } }), 21); assert.equal(await client.commentMention.count({ where: { comment: { taskId: task.id } } }), 0);
  assert.equal((await request(base, `/projects/${projectId}/members/${member.id}`, pm, 'DELETE', {})).status, 204);
  assert.equal((await request(base, `/tasks/${task.id}/comments`, member)).status, 403);
  assert.equal(await client.comment.count({ where: { taskId: task.id, authorId: member.id } }), 21);
  assert.equal((await request(base, `/tasks/${task.id}`, pm, 'DELETE', {})).status, 204);
  assert.equal(await client.comment.count({ where: { taskId: task.id } }), 0);
}));

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
  for (const [expectedStatus, status] of [['DONE', 'REVIEW'], ['REVIEW', 'IN_PROGRESS'], ['IN_PROGRESS', 'TODO']]) assert.equal((await request(base, `${path}/status`, pm, 'PATCH', { expectedStatus, status })).status, 200);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'TODO');
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

test('task dates must stay within project timeframe and updating project dates validates against tasks', async () => fixture(async ({ base, client, projectId, users }) => {
  const [, pm] = users; assert.ok(pm);
  await client.project.update({ where: { id: projectId }, data: { startDate: new Date('2026-10-10T00:00:00Z'), endDate: new Date('2026-10-20T00:00:00Z') } });
  const list = `/projects/${projectId}/tasks`;

  assert.equal((await request(base, list, pm, 'POST', { title: 'Before start', startDate: '2026-10-09', dueDate: '2026-10-15' })).status, 400);
  assert.equal((await request(base, list, pm, 'POST', { title: 'Due before start', dueDate: '2026-10-09' })).status, 400);
  assert.equal((await request(base, list, pm, 'POST', { title: 'After end', startDate: '2026-10-15', dueDate: '2026-10-21' })).status, 400);
  assert.equal((await request(base, list, pm, 'POST', { title: 'Start after end', startDate: '2026-10-21' })).status, 400);

  const task = await create(base, projectId, pm, { startDate: '2026-10-12', dueDate: '2026-10-18' });
  assert.ok(task.id);

  assert.equal((await request(base, `/tasks/${task.id}`, pm, 'PATCH', { startDate: '2026-10-08' })).status, 400);
  assert.equal((await request(base, `/tasks/${task.id}`, pm, 'PATCH', { dueDate: '2026-10-22' })).status, 400);

  assert.equal((await request(base, `/projects/${projectId}`, pm, 'PATCH', { startDate: '2026-10-15' })).status, 400);
  assert.equal((await request(base, `/projects/${projectId}`, pm, 'PATCH', { endDate: '2026-10-16' })).status, 400);

  assert.equal((await request(base, `/projects/${projectId}`, pm, 'PATCH', { startDate: '2026-10-11', endDate: '2026-10-19' })).status, 200);
}));

test('Multiple assignees: creation, assignment, notification, status permissions, and My Tasks query', async () => fixture(async ({ base, client, projectId, users }) => {
  const [owner, pm, user1, user2] = users; assert.ok(owner && pm && user1 && user2);

  // 1. Create task with multiple assignees [user1, user2]
  const res = await request(base, `/projects/${projectId}/tasks`, pm, 'POST', {
    title: 'Multi-assignee task',
    assigneeIds: [user1.id, user2.id],
  });
  assert.equal(res.status, 201);
  const created = (await res.json() as { task: { id: string; assigneeId: string | null; assigneeIds: string[]; assignees: { id: string }[] } }).task;
  assert.equal(created.assigneeIds.length, 2);
  assert.ok(created.assigneeIds.includes(user1.id));
  assert.ok(created.assigneeIds.includes(user2.id));
  assert.equal(created.assignees.length, 2);
  assert.equal(created.assigneeId, user1.id);

  // Notifications sent to both assigned users
  assert.equal(await client.notification.count({ where: { relatedEntityId: created.id, userId: user1.id } }), 1);
  assert.equal(await client.notification.count({ where: { relatedEntityId: created.id, userId: user2.id } }), 1);

  // Both users see it in /tasks/mine
  const mine1 = await (await request(base, '/tasks/mine', user1)).json() as { total: number; tasks: { id: string }[] };
  const mine2 = await (await request(base, '/tasks/mine', user2)).json() as { total: number; tasks: { id: string }[] };
  assert.ok(mine1.tasks.some((t) => t.id === created.id));
  assert.ok(mine2.tasks.some((t) => t.id === created.id));

  // The secondary assignee (user2) can advance status
  const path = `/tasks/${created.id}`;
  const statusRes = await request(base, `${path}/status`, user2, 'PATCH', { expectedStatus: 'TODO', status: 'IN_PROGRESS' });
  assert.equal(statusRes.status, 200);

  // Re-assign to [user2] (removing user1, keeping user2)
  const assignRes = await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeIds: [user2.id] });
  assert.equal(assignRes.status, 200);
  const detail = await (await request(base, path, pm)).json() as { task: { assigneeIds: string[]; assigneeId: string | null } };
  assert.deepEqual(detail.task.assigneeIds, [user2.id]);
  assert.equal(detail.task.assigneeId, user2.id);

  // Unassign all
  const unassignRes = await request(base, `${path}/assignee`, pm, 'PATCH', { assigneeIds: [] });
  assert.equal(unassignRes.status, 200);
  const unassignedDetail = await (await request(base, path, pm)).json() as { task: { assigneeId: string | null; assigneeIds: string[] } };
  assert.equal(unassignedDetail.task.assigneeId, null);
  assert.equal(unassignedDetail.task.assigneeIds.length, 0);
}));


