import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { HttpError } from '../src/domain/errors.js';
import { loginSchema, profileSchema, registrationSchema, validate } from '../src/services/auth-validation.js';
import { tokenHash, sessionLifetimeMs, type AuthService } from '../src/services/auth.js';
import { hashPassword, verifyPassword } from '../src/services/password.js';
import { withHttp } from './helpers/http.js';

const origin = 'http://127.0.0.1:5173';
const user = { id: 'test-id', email: 'test@example.invalid', displayName: 'Test', systemRole: 'MEMBER' as const, createdAt: new Date().toISOString() };

function stubService(): AuthService {
  const failure = async () => { throw new HttpError(401, 'Email hoặc mật khẩu không đúng.'); };
  return { register: failure, login: failure, me: async () => user, updateProfile: async () => user, logout: async () => {} };
}

test('registration normalizes email/name, preserves password and rejects role injection', () => {
  const input = { email: ' User@Example.com ', displayName: ' Tên của tôi ', password: ' a long passphrase ' };
  assert.deepEqual(validate(registrationSchema, input), { ...input, email: 'user@example.com', displayName: 'Tên của tôi' });
  for (const extra of [{ systemRole: 'SYSTEM_ADMIN' }, { status: 'ACTIVE' }]) {
    assert.throws(() => validate(registrationSchema, { ...input, ...extra }), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
  assert.throws(() => validate(registrationSchema, { ...input, password: 'short' }), (error: unknown) => error instanceof HttpError && Boolean(error.fields?.password));
  assert.throws(() => validate(registrationSchema, { ...input, email: 'invalid' }), (error: unknown) => error instanceof HttpError && Boolean(error.fields?.email));
  assert.throws(() => validate(profileSchema, { displayName: '   ' }), HttpError);
  assert.throws(() => validate(profileSchema, { displayName: 'Test', id: 'another-user' }), HttpError);
  assert.equal(validate(loginSchema, { email: 'USER@example.com', password: ' ' }).password, ' ');
});

test('scrypt uses random salts, verifies Unicode/whitespace and rejects wrong or malformed hashes', async () => {
  const password = '  mật khẩu dài của tôi  ';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword(password, 'not-a-hash'), false);
  assert.equal(await verifyPassword(password, undefined), false);
});

test('session token hashes are distinct from raw tokens and invalid tokens are rejected', () => {
  const token = randomBytes(32).toString('base64url');
  assert.match(tokenHash(token)!, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(token), token);
  for (const invalid of [undefined, '', 'tampered', 'a'.repeat(44), '%'.repeat(43)]) assert.equal(tokenHash(invalid), undefined);
});

test('auth rejects missing/foreign origins and non-JSON mutations', async () => {
  await withHttp(createApp({ checkConnection: async () => {} }, { service: stubService(), appOrigin: origin, secureCookies: false }), async (base) => {
    for (const requestOrigin of [undefined, 'https://evil.example', 'null']) {
      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(requestOrigin ? { Origin: requestOrigin } : {}) }, body: '{}',
      });
      assert.equal(response.status, 403);
    }
    const form = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=test' });
    assert.equal(form.status, 415);
  });
});

test('auth rate limit returns JSON 429 and Retry-After', async () => {
  await withHttp(createApp({ checkConnection: async () => {} }, { service: stubService(), appOrigin: origin, secureCookies: false, rateLimit: 1 }), async (base) => {
    const options = { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' };
    assert.equal((await fetch(`${base}/api/auth/login`, options)).status, 401);
    const limited = await fetch(`${base}/api/auth/login`, options);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    assert.match((await limited.json() as { message: string }).message, /quá nhiều/);
  });
});

test('wrong login does not clear an existing session cookie', async () => {
  await withHttp(createApp({ checkConnection: async () => {} }, { service: stubService(), appOrigin: origin, secureCookies: false }), async (base) => {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `task_manager_session=${randomBytes(32).toString('base64url')}` }, body: '{}' });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('UC02 system failure returns a retry message and never issues a session cookie', async () => {
  const service = stubService();
  service.login = async () => { throw new Error('internal-database-secret'); };
  await withHttp(createApp({ checkConnection: async () => {} }, { service, appOrigin: origin, secureCookies: false }), async (base) => {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(await response.json(), { message: 'Không thể xử lý yêu cầu. Vui lòng thử lại sau.' });
  });
});

test('production sessions use host-only Secure HttpOnly cookies and never return tokens in JSON', async () => {
  const service = stubService();
  service.login = async () => ({ user, token: randomBytes(32).toString('base64url'), expiresAt: new Date(Date.now() + sessionLifetimeMs) });
  await withHttp(createApp({ checkConnection: async () => {} }, { service, appOrigin: 'https://app.example', secureCookies: true }), async (base) => {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://app.example', 'Content-Type': 'application/json' }, body: '{}' });
    const cookie = response.headers.get('set-cookie')!;
    assert.match(cookie, /^__Host-task_manager_session=/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) assert.ok(cookie.includes(flag));
    assert.equal(cookie.includes('Domain='), false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { user });
  });
});

test('production configuration requires HTTPS and rejects origins containing paths or credentials', () => {
  const config = { DATABASE_URL: 'postgresql://localhost/test' };
  assert.throws(() => readConfig({ ...config, NODE_ENV: 'production' }), /HTTPS/);
  for (const invalid of ['http://localhost/other', 'file:///tmp', 'http://user:pass@localhost', 'http://localhost?foo=bar']) {
    assert.throws(() => readConfig({ ...config, APP_ORIGIN: invalid }), /APP_ORIGIN/);
  }
  assert.equal(readConfig({ ...config, NODE_ENV: 'production', APP_ORIGIN: 'https://app.example' }).secureCookies, true);
});
