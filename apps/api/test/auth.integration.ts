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
import { createPasswordResetService, forgotMessage } from '../src/services/password-resets.js';
import type { Email } from '../src/services/email.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173';
const password = 'a safe integration passphrase';

async function fixture(run: (context: { base: string; client: PrismaClient; email: () => string; messages: Email[]; freshApp: () => ReturnType<typeof createApp> }) => Promise<void>) {
  const url = readConfig().databaseUrl;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 3000, max: 2 }) });
  const database = createDatabase(url);
  const service = createAuthService(database.accounts);
  const messages: Email[] = [];
  const passwordResets = createPasswordResetService(database.passwordResets, { enabled: true, async send(message) { messages.push(message); } }, origin);
  const app = createApp(database, { service, passwordResets, appOrigin: origin, secureCookies: false });
  const emails: string[] = [];
  const email = () => { const value = `auth-${randomUUID()}@example.invalid`; emails.push(value); return value; };
  try {
    await withHttp(app, (base) => run({ base, client, email, messages, freshApp: () => createApp(database, {
      passwordResets,
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

function resetToken(message: Email) { return new URL(message.text.match(/https?:\/\/\S+/)![0]).hash.slice('#reset='.length); }

test('UC04: single-use hashed reset links change the password, revoke all sessions and reject stale login creation', async () => fixture(async ({ base, client, email, messages }) => {
  const address = email(); const newPassword = 'new secure integration passphrase';
  const registered = await request(base, '/register', 'POST', { email: address, password, displayName: 'Reset account' });
  const oldCookie = sessionCookie(registered);
  const user = await client.user.findUniqueOrThrow({ where: { email: address } });
  const second = await request(base, '/login', 'POST', { email: address, password }); assert.equal(second.status, 200);
  const forgotten = await request(base, '/password/forgot', 'POST', { email: ` ${address.toUpperCase()} ` });
  assert.equal(forgotten.status, 202); assert.deepEqual(await forgotten.json(), { message: forgotMessage }); assert.equal(messages.length, 1);
  const token = resetToken(messages[0]!); const stored = await client.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: tokenHash(token)! } });
  assert.equal(stored.userId, user.id); assert.notEqual(stored.tokenHash, token); assert.ok(stored.expiresAt.getTime() > Date.now());
  assert.equal((await request(base, '/password/forgot', 'POST', { email: address })).status, 202); assert.equal(messages.length, 1);
  const reset = await request(base, '/password/reset', 'POST', { token, password: newPassword }, oldCookie);
  assert.equal(reset.status, 200); assert.match(reset.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
  assert.equal(await client.session.count({ where: { userId: user.id } }), 0); assert.equal(await client.passwordResetToken.count({ where: { userId: user.id } }), 0);
  assert.equal((await request(base, '/me', 'GET', undefined, oldCookie)).status, 401);
  assert.equal((await request(base, '/me', 'GET', undefined, sessionCookie(second))).status, 401);
  assert.equal((await request(base, '/login', 'POST', { email: address, password })).status, 401);
  assert.equal((await request(base, '/login', 'POST', { email: address, password: newPassword })).status, 200);
  assert.equal((await request(base, '/password/reset', 'POST', { token, password: 'another valid passphrase' })).status, 400);
  await assert.rejects(createAccountRepository(client).createSession(user.id, tokenHash('a'.repeat(43))!, new Date(Date.now() + 60_000), undefined, user.passwordHash));
  assert.equal(await client.session.count({ where: { userId: user.id } }), 1);
}));

test('reset rejects expired/replaced links, invalid input and locked accounts without exposing email existence', async () => fixture(async ({ base, client, email, messages }) => {
  const address = email(); await request(base, '/register', 'POST', { email: address, password, displayName: 'Reset validation' });
  const absent = await request(base, '/password/forgot', 'POST', { email: email() }); assert.equal(absent.status, 202); assert.deepEqual(await absent.json(), { message: forgotMessage }); assert.equal(messages.length, 0);
  await request(base, '/password/forgot', 'POST', { email: address }); const first = resetToken(messages[0]!);
  await client.passwordResetToken.updateMany({ where: { tokenHash: tokenHash(first)! }, data: { createdAt: new Date(Date.now() - 61_000) } });
  await request(base, '/password/forgot', 'POST', { email: address }); assert.equal(messages.length, 2); const latest = resetToken(messages[1]!);
  assert.equal((await request(base, '/password/reset', 'POST', { token: first, password })).status, 400);
  for (const input of [{ token: latest, password: 'short' }, { token: latest, password, userId: 'injected' }, { token: 'invalid', password }]) assert.equal((await request(base, '/password/reset', 'POST', input)).status, 400);
  const foreign = await fetch(`${base}/api/auth/password/reset`, { method: 'POST', headers: { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: latest, password }) }); assert.equal(foreign.status, 403);
  await client.user.update({ where: { email: address }, data: { status: 'LOCKED' } });
  const locked = await request(base, '/password/forgot', 'POST', { email: address }); assert.deepEqual(await locked.json(), { message: forgotMessage }); assert.equal(messages.length, 2);
  assert.equal((await request(base, '/password/reset', 'POST', { token: latest, password })).status, 400);
  await client.user.update({ where: { email: address }, data: { status: 'ACTIVE' } });
  await client.passwordResetToken.updateMany({ where: { tokenHash: tokenHash(latest)! }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await request(base, '/password/reset', 'POST', { token: latest, password })).status, 400);
  assert.equal((await request(base, '/login', 'POST', { email: address, password })).status, 200);
}));

test('concurrent resets consume only once and email failure revokes the unsent token', async () => fixture(async ({ base, client, email, messages }) => {
  const address = email(); await request(base, '/register', 'POST', { email: address, password, displayName: 'Concurrent reset' });
  await request(base, '/password/forgot', 'POST', { email: address }); const token = resetToken(messages[0]!);
  const results = await Promise.all(['new password variant one', 'new password variant two'].map((value) => request(base, '/password/reset', 'POST', { token, password: value })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  const failing = createPasswordResetService((await import('../src/repositories/password-resets.js')).createPasswordResetRepository(client), { enabled: true, async send() { throw new Error('Injected mail failure'); } }, origin);
  assert.deepEqual(await failing.forgot({ email: address }), { message: forgotMessage });
  const user = await client.user.findUniqueOrThrow({ where: { email: address } });
  assert.equal(await client.passwordResetToken.count({ where: { userId: user.id } }), 0);
}));

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
