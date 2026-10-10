import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';

const config = readConfig();
const web = process.env.WEB_URL || 'http://127.0.0.1:5173';
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
const emails = [0, 1, 2].map(() => `task-proxy-${randomUUID()}@example.invalid`);
const users = [];
let workspaceId;
async function request(path, cookie, method = 'GET', data) {
  return fetch(`${web}/api${path}`, { method, headers: { Origin: config.appOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15_000) });
}
try {
  for (const email of emails) {
    const response = await request('/auth/register', undefined, 'POST', { email, password: 'a local task check passphrase', displayName: 'Kiểm tra Task' });
    assert.equal(response.status, 201); users.push({ ...(await response.json()).user, cookie: response.headers.get('set-cookie').split(';')[0] });
  }
  const [owner, pm, member] = users;
  const workspaceResponse = await request('/workspaces', owner.cookie, 'POST', { name: 'Task proxy check' });
  assert.equal(workspaceResponse.status, 201); workspaceId = (await workspaceResponse.json()).workspace.id;
  for (const user of [pm, member]) assert.equal((await request(`/workspaces/${workspaceId}/members`, owner.cookie, 'POST', { email: user.email })).status, 201);
  const createdProject = await request(`/workspaces/${workspaceId}/projects`, owner.cookie, 'POST', { name: 'Dự án Task' });
  assert.equal(createdProject.status, 201); const projectId = (await createdProject.json()).project.id;
  assert.equal((await request(`/projects/${projectId}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null })).status, 200);
  assert.equal((await request(`/projects/${projectId}/members`, pm.cookie, 'POST', { userId: member.id })).status, 201);
  const createdTask = await request(`/projects/${projectId}/tasks`, pm.cookie, 'POST', { title: 'Công việc kiểm tra', assigneeId: member.id, priority: 'HIGH', startDate: '2026-10-10', dueDate: '2026-10-20', effort: 3 });
  assert.equal(createdTask.status, 201); const taskId = (await createdTask.json()).task.id;
  assert.equal((await (await request('/tasks/mine', member.cookie)).json()).total, 1);
  assert.equal((await request(`/tasks/${taskId}`, owner.cookie, 'PATCH', { title: 'Owner denied' })).status, 403);
  assert.equal((await request(`/projects/${projectId}/close`, pm.cookie, 'POST', {})).status, 409);
  const notifications = await (await request('/notifications', member.cookie)).json();
  assert.ok(notifications.items.some((item) => item.relatedEntityType === 'TASK' && item.relatedEntityId === taskId));
  for (const [expectedStatus, status] of [['TODO', 'IN_PROGRESS'], ['IN_PROGRESS', 'REVIEW'], ['REVIEW', 'DONE']]) assert.equal((await request(`/tasks/${taskId}/status`, member.cookie, 'PATCH', { expectedStatus, status })).status, 200);
  assert.equal((await (await request(`/projects/${projectId}/tasks?status=DONE&q=kiểm`, pm.cookie)).json()).total, 1);
  assert.equal((await request(`/projects/${projectId}/close`, pm.cookie, 'POST', {})).status, 200);
  assert.equal((await (await request(`/tasks/${taskId}`, member.cookie)).json()).task.canEdit, false);
  console.log('PASS: Workspace → Project → PM → giao Task → My Tasks/thông báo → đổi trạng thái → lọc → đóng Project, qua frontend proxy.');
} finally {
  try {
    if (workspaceId) {
      await client.project.deleteMany({ where: { workspaceId, workspace: { creator: { email: { in: emails } } } } });
      await client.workspace.deleteMany({ where: { id: workspaceId, creator: { email: { in: emails } } } });
    }
    await client.user.deleteMany({ where: { email: { in: emails } } });
  } finally { await client.$disconnect(); }
}
