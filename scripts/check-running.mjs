import assert from 'node:assert/strict';

const web = process.env.WEB_URL || 'http://127.0.0.1:5173';
const api = process.env.API_URL || 'http://127.0.0.1:4000';

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `${url} must return 200`);
  return response.json();
}

const page = await fetch(web, { signal: AbortSignal.timeout(10_000) });
assert.equal(page.status, 200);
assert.match(await page.text(), /<html lang="vi">/);
assert.deepEqual(await json(`${api}/api/health`), { status: 'ok', service: 'task-manager-api' });
assert.deepEqual(await json(`${api}/api/health/ready`), { status: 'ok', database: 'connected' });
assert.deepEqual(await json(`${web}/api/health`), { status: 'ok', service: 'task-manager-api' });
assert.deepEqual(await json(`${web}/api/health/ready`), { status: 'ok', database: 'connected' });
const missing = await fetch(`${web}/api/missing`, { signal: AbortSignal.timeout(10_000) });
assert.equal(missing.status, 404);
assert.deepEqual(await missing.json(), { message: 'Không tìm thấy API này.' });
console.log('PASS: React entrypoint, API liveness, PostgreSQL readiness, Vite proxy and JSON 404.');
