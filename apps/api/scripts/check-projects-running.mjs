import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';

const config = readConfig();
const web = process.env.WEB_URL || 'http://127.0.0.1:5173';
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
const emails = [0, 1, 2].map(() => `project-proxy-${randomUUID()}@example.invalid`);
const users = [];
let workspaceId;
async function request(path, cookie, method = 'GET', data) {
  return fetch(`${web}/api${path}`, { method, headers: { Origin: config.appOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15_000) });
}
try {
  for (const email of emails) {
    const response = await request('/auth/register', undefined, 'POST', { email, password: 'a local project check passphrase', displayName: 'Kiểm tra Project' });
    assert.equal(response.status, 201); users.push({ ...(await response.json()).user, cookie: response.headers.get('set-cookie').split(';')[0] });
  }
  const [owner, pm, member] = users;
  const workspaceResponse = await request('/workspaces', owner.cookie, 'POST', { name: 'Project proxy check' });
  assert.equal(workspaceResponse.status, 201); workspaceId = (await workspaceResponse.json()).workspace.id;
  for (const user of [pm, member]) assert.equal((await request(`/workspaces/${workspaceId}/members`, owner.cookie, 'POST', { email: user.email })).status, 201);
  const created = await request(`/workspaces/${workspaceId}/projects`, owner.cookie, 'POST', { name: 'Dự án kiểm tra', startDate: '2026-10-10', endDate: '2026-11-10' });
  assert.equal(created.status, 201); const path = `/projects/${(await created.json()).project.id}`;
  assert.equal((await request(`${path}/manager`, owner.cookie, 'PATCH', { managerUserId: pm.id, expectedManagerUserId: null })).status, 200);
  assert.equal((await request(path, owner.cookie, 'PATCH', { name: 'Owner denied' })).status, 403);
  assert.equal((await request(path, pm.cookie, 'PATCH', { name: 'PM đã cập nhật' })).status, 200);
  assert.equal((await request(`${path}/members`, pm.cookie, 'POST', { userId: member.id })).status, 201);
  assert.equal((await request(path, member.cookie)).status, 200);
  assert.equal((await request(`${path}/manager`, owner.cookie, 'PATCH', { managerUserId: member.id, expectedManagerUserId: pm.id })).status, 200);
  assert.equal((await request(path, pm.cookie, 'PATCH', { name: 'Old PM denied' })).status, 403);
  assert.equal((await request(`${path}/close`, member.cookie, 'POST', {})).status, 200);
  const detail = await (await request(path, owner.cookie)).json(); assert.equal(detail.project.status, 'CLOSED');
  assert.equal((await request(path, member.cookie, 'PATCH', { name: 'Closed denied' })).status, 409);
  const notifications = await (await request('/notifications', member.cookie)).json();
  assert.ok(notifications.items.some((item) => item.relatedEntityType === 'PROJECT'));
  console.log('PASS: Workspace → tạo Project → phân công/thay PM → thành viên → phân quyền → đóng Project → thông báo qua frontend proxy.');
} finally {
  try {
    if (workspaceId) {
      await client.project.deleteMany({ where: { workspaceId, workspace: { creator: { email: { in: emails } } } } });
      await client.workspace.deleteMany({ where: { id: workspaceId, creator: { email: { in: emails } } } });
    }
    await client.user.deleteMany({ where: { email: { in: emails } } });
  } finally { await client.$disconnect(); }
}
