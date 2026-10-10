import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { type DatabaseHealth } from '../src/services/health.js';

async function withApi(database: DatabaseHealth, run: (base: string) => Promise<void>) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('liveness remains available when the database fails; readiness returns sanitized 503', async () => {
  await withApi({ checkConnection: async () => { throw new Error('secret-database-password'); } }, async (base) => {
    const live = await fetch(`${base}/api/health`);
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('x-powered-by'), null);
    const ready = await fetch(`${base}/api/health/ready`);
    assert.equal(ready.status, 503);
    assert.equal(ready.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ready.json(), { status: 'degraded', database: 'unavailable' });
  });
});

test('readiness checks the database and returns connected', async () => {
  let checked = false;
  await withApi({ checkConnection: async () => { checked = true; } }, async (base) => {
    const response = await fetch(`${base}/api/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
    assert.equal(checked, true);
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
  });
});

test('invalid JSON returns 400 rather than HTML or a stack trace', async () => {
  await withApi({ checkConnection: async () => {} }, async (base) => {
    const response = await fetch(`${base}/api/missing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'JSON không hợp lệ.' });
  });
});

test('configuration rejects missing credentials and invalid ports without exposing secrets', () => {
  assert.throws(() => readConfig({}), /Thiếu DATABASE_URL/);
  for (const port of ['0', '65536', 'abc', '1.5', '']) {
    assert.throws(() => readConfig({ PORT: port, DATABASE_URL: 'postgresql://localhost/test' }), /PORT/);
  }
  assert.throws(() => readConfig({ DATABASE_URL: 'https://secret-password@test' }), /PostgreSQL/);
});

test('oversized JSON returns 413 with a sanitized response', async () => {
  await withApi({ checkConnection: async () => {} }, async (base) => {
    const response = await fetch(`${base}/api/missing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(110_000) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { message: 'Dữ liệu yêu cầu quá lớn.' });
  });
});
