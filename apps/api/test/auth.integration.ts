import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/repositories/database.js';
import { createAccountRepository } from '../src/repositories/accounts.js';
import { createAuthService, tokenHash } from '../src/services/auth.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173';
const password = 'a safe integration passphrase';

async function fixture(run: (context: { base: string; client: PrismaClient; email: () => string; freshApp: () => ReturnType<typeof createApp> }) => Promise<void>) {
  const url = readConfig().databaseUrl;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 3000, max: 2 }) });
  const database = createDatabase(url);
  const service = createAuthService(database.accounts);
  const app = createApp(database, { service, appOrigin: origin, secureCookies: false });
  const emails: string[] = [];
  const email = () => { const value = `auth-${randomUUID()}@example.invalid`; emails.push(value); return value; };
  try {
    await withHttp(app, (base) => run({ base, client, email, freshApp: () => createApp(database, {
      service: createAuthService(createAccountRepository(client)), appOrigin: origin, secureCookies: false,
    }) }));
  } finally {
    try { await client.user.deleteMany({ where: { email: { in: emails } } }); }
    finally { await Promise.all([client.$disconnect(), database.disconnect()]); }
  }
}

function request(base: string, path: string, method = 'GET', body?: unknown, cookie?: string) {
  return fetch(`${base}/api/auth${path}`, {
    method, headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
}
function sessionCookie(response: Response) {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'a successful login must issue a cookie');
  return cookie.split(';')[0]!;
}

test('registration, persisted session, profile, rotation and logout work against real PostgreSQL', async () => {
  await fixture(async ({ base, client, email, freshApp }) => {
    const address = email();
    const registration = await request(base, '/register', 'POST', { email: ` ${address.toUpperCase()} `, password, displayName: ' Người dùng thử ' });
    assert.equal(registration.status, 201);
    const cookie = sessionCookie(registration);
    const body = await registration.json() as { user: { id: string; email: string; displayName: string; systemRole: string } };
    assert.equal(body.user.email, address);
    assert.equal(body.user.displayName, 'Người dùng thử');
    assert.equal(body.user.systemRole, 'MEMBER');
    assert.equal(JSON.stringify(body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(body).includes('token'), false);
    assert.match(registration.headers.get('set-cookie')!, /HttpOnly/);
    assert.match(registration.headers.get('set-cookie')!, /SameSite=Lax/);

    const stored = await client.user.findUniqueOrThrow({ where: { email: address } });
    assert.notEqual(stored.passwordHash, password);
    assert.match(stored.passwordHash, /^scrypt\$/);
    const token = cookie.split('=')[1]!;
    const session = await client.session.findUniqueOrThrow({ where: { tokenHash: tokenHash(token)! } });
    assert.equal(session.userId, stored.id);
    assert.notEqual(session.tokenHash, token);
    assert.equal((await request(base, '/me')).status, 401);
    assert.equal((await request(base, '/me', 'GET', undefined, cookie)).status, 200);

    // A fresh service/router instance resolves the existing cookie from PostgreSQL.
    await withHttp(freshApp(), async (otherBase) => {
      assert.equal((await request(otherBase, '/me', 'GET', undefined, cookie)).status, 200);
    });
    const updated = await request(base, '/me', 'PATCH', { displayName: ' Tên đã đổi ' }, cookie);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as { user: { displayName: string } }).user.displayName, 'Tên đã đổi');
    assert.equal((await client.user.findUniqueOrThrow({ where: { email: address } })).displayName, 'Tên đã đổi');

    const login = await request(base, '/login', 'POST', { email: address, password }, cookie);
    assert.equal(login.status, 200);
    const rotated = sessionCookie(login);
    assert.notEqual(rotated, cookie);
    assert.equal((await request(base, '/me', 'GET', undefined, cookie)).status, 401);
    assert.equal((await request(base, '/me', 'GET', undefined, rotated)).status, 200);
    const logout = await request(base, '/logout', 'POST', {}, rotated);
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
    assert.equal(await client.session.count({ where: { userId: stored.id } }), 0);
    assert.equal((await request(base, '/me', 'GET', undefined, rotated)).status, 401);
    assert.equal((await request(base, '/logout', 'POST', {}, rotated)).status, 204);
  });
});

test('duplicate email, wrong credentials, locked accounts and expired sessions are rejected', async () => {
  await fixture(async ({ base, client, email }) => {
    const address = email();
    const data = { email: address, password, displayName: 'Account' };
    const registered = await request(base, '/register', 'POST', data);
    assert.equal(registered.status, 201);
    const cookie = sessionCookie(registered);
    assert.equal((await request(base, '/register', 'POST', { ...data, email: address.toUpperCase() })).status, 409);
    const wrong = await request(base, '/login', 'POST', { email: address, password: 'wrong passphrase' });
    const unknown = await request(base, '/login', 'POST', { email: email(), password });
    assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());

    await client.user.update({ where: { email: address }, data: { status: 'LOCKED' } });
    assert.equal((await request(base, '/me', 'GET', undefined, cookie)).status, 401);
    assert.equal((await request(base, '/login', 'POST', { email: address, password })).status, 403);
    await client.user.update({ where: { email: address }, data: { status: 'ACTIVE' } });
    const login = await request(base, '/login', 'POST', { email: address, password });
    assert.equal(login.status, 200);
    const token = sessionCookie(login);
    await client.session.updateMany({ where: { user: { email: address } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(base, '/me', 'GET', undefined, token);
    assert.equal(expired.status, 401);
    assert.equal(await client.session.count({ where: { user: { email: address } } }), 0);
    assert.equal((await request(base, '/me', 'GET', undefined, 'task_manager_session=tampered')).status, 401);
  });
});

test('profile and logout are isolated between two users and protected against privilege injection', async () => {
  await fixture(async ({ base, client, email }) => {
    const firstEmail = email(); const secondEmail = email();
    const first = await request(base, '/register', 'POST', { email: firstEmail, password, displayName: 'First' });
    const second = await request(base, '/register', 'POST', { email: secondEmail, password, displayName: 'Second' });
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    const firstCookie = sessionCookie(first); const secondCookie = sessionCookie(second);
    assert.equal((await request(base, '/me', 'PATCH', { displayName: 'Changed' }, firstCookie)).status, 200);
    assert.equal((await client.user.findUniqueOrThrow({ where: { email: secondEmail } })).displayName, 'Second');
    assert.equal((await request(base, '/me', 'PATCH', { displayName: 'Injected', systemRole: 'SYSTEM_ADMIN', id: (await second.json() as { user: { id: string } }).user.id }, firstCookie)).status, 400);
    assert.equal((await client.user.findUniqueOrThrow({ where: { email: firstEmail } })).systemRole, 'MEMBER');
    assert.equal((await request(base, '/logout', 'POST', {}, firstCookie)).status, 204);
    assert.equal((await request(base, '/me', 'GET', undefined, secondCookie)).status, 200);
  });
});

test('invalid input and foreign origins never create accounts or sessions', async () => {
  await fixture(async ({ base, client, email }) => {
    const address = email();
    const input = { email: address, password, displayName: 'Name' };
    for (const data of [{ ...input, email: 'bad-email' }, { ...input, password: 'short' }, { ...input, displayName: ' ' }, { ...input, systemRole: 'SYSTEM_ADMIN' }]) {
      assert.equal((await request(base, '/register', 'POST', data)).status, 400);
    }
    const foreign = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(foreign.status, 403);
    assert.equal(await client.user.findUnique({ where: { email: address } }), null);
  });
});
