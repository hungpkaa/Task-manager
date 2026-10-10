import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';

const config = readConfig();
const web = process.env.WEB_URL || 'http://127.0.0.1:5173';
const email = `proxy-check-${randomUUID()}@example.invalid`;
const password = 'a local proxy check passphrase';
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
let cookie;

async function request(path, method = 'GET', data) {
  return fetch(`${web}/api/auth${path}`, {
    method, headers: { Origin: config.appOrigin, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15_000),
  });
}
function saveCookie(response) {
  const value = response.headers.get('set-cookie');
  assert.ok(value);
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  cookie = value.split(';')[0];
}

try {
  assert.equal((await request('/me')).status, 401);
  const registered = await request('/register', 'POST', { email, password, displayName: 'Kiểm tra qua frontend' });
  assert.equal(registered.status, 201);
  saveCookie(registered);
  assert.equal((await request('/me')).status, 200);
  const updated = await request('/me', 'PATCH', { displayName: 'Hồ sơ đã lưu' });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).user.displayName, 'Hồ sơ đã lưu');
  assert.equal((await request('/logout', 'POST', {})).status, 204);
  assert.equal((await request('/me')).status, 401);
  cookie = undefined;
  const login = await request('/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  saveCookie(login);
  assert.equal((await request('/me')).status, 200);
  assert.equal((await request('/logout', 'POST', {})).status, 204);
  console.log('PASS: đăng ký, cookie, hồ sơ, đăng xuất và đăng nhập qua frontend proxy.');
} finally {
  try { await client.user.deleteMany({ where: { email } }); }
  finally { await client.$disconnect(); }
}
