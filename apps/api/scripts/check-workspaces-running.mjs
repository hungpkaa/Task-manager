import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';

const config = readConfig();
const web = process.env.WEB_URL || 'http://127.0.0.1:5173';
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
const emails = [0, 1].map(() => `workspace-proxy-${randomUUID()}@example.invalid`);
const cookies = [];
let workspaceId;
async function request(path, cookie, method = 'GET', data) {
  return fetch(`${web}/api${path}`, { method, headers: { Origin: config.appOrigin,
    ...(cookie ? { Cookie: cookie } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
  }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15_000) });
}
try {
  for (const email of emails) {
    const response = await request('/auth/register', undefined, 'POST', { email, password: 'a local workspace check passphrase', displayName: 'Kiểm tra Workspace' });
    assert.equal(response.status, 201); cookies.push(response.headers.get('set-cookie').split(';')[0]);
  }
  const created = await request('/workspaces', cookies[0], 'POST', { name: 'Workspace kiểm tra proxy' });
  assert.equal(created.status, 201); workspaceId = (await created.json()).workspace.id;
  const path = `/workspaces/${workspaceId}`;
  assert.equal((await request(`${path}/members`, cookies[0], 'POST', { email: emails[1] })).status, 201);
  assert.equal((await request(path, cookies[1])).status, 200);
  assert.equal((await request(path, cookies[1], 'PATCH', { name: 'Không được phép' })).status, 403);
  const notifications = await (await request('/notifications', cookies[1])).json();
  assert.equal(notifications.unreadCount, 1);
  assert.equal((await request(`/notifications/${notifications.items[0].id}/read`, cookies[1], 'PATCH', {})).status, 200);
  assert.equal((await request(`${path}/members`, cookies[0], 'POST', { email: emails[1] })).status, 409);
  console.log('PASS: đăng ký → tạo Workspace → thêm thành viên → kiểm tra quyền → đọc thông báo qua frontend proxy.');
} finally {
  try {
    if (workspaceId) await client.workspace.deleteMany({ where: { id: workspaceId, creator: { email: { in: emails } } } });
    await client.user.deleteMany({ where: { email: { in: emails } } });
  } finally { await client.$disconnect(); }
}
