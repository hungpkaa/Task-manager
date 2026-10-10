import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmailSender } from '../src/services/email.js';

test('development email is written to a private local mailbox and production cannot use file mode', async () => {
  const root = fileURLToPath(new URL('../../../.local', import.meta.url)); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, 'email-unit-'));
  try {
    const sender = createEmailSender({ MAIL_MODE: 'file', MAIL_DIRECTORY: directory });
    const message = { to: 'test@example.invalid', subject: 'Reset test', text: 'Test link content' };
    await sender.send(message);
    const files = await readdir(directory); assert.equal(files.length, 1);
    const body = JSON.parse(await readFile(resolve(directory, files[0]!), 'utf8'));
    assert.equal(body.to, message.to); assert.equal(body.text, message.text); assert.ok(body.createdAt);
    assert.throws(() => createEmailSender({ NODE_ENV: 'production', MAIL_MODE: 'file' }));
    await assert.rejects(createEmailSender({ MAIL_MODE: 'disabled' }).send(message));
  } finally { for (const file of await readdir(directory)) await unlink(resolve(directory, file)); await rmdir(directory); }
});

test('Resend adapter validates configuration and submits expected payload with a mocked provider only', async () => {
  assert.throws(() => createEmailSender({ MAIL_MODE: 'resend' }));
  const environment = { MAIL_MODE: 'resend', RESEND_API_KEY: 'test-key-only', MAIL_FROM: 'Task Manager <no-reply@example.invalid>' };
  let calls = 0;
  const mockedFetch = (async (url: string | URL | Request, options?: RequestInit) => {
    calls++; assert.equal(url, 'https://api.resend.com/emails');
    assert.equal((options!.headers as Record<string, string>).Authorization, 'Bearer test-key-only');
    assert.deepEqual(JSON.parse(options!.body as string), { from: environment.MAIL_FROM, to: ['test@example.invalid'], subject: 'Reset test', text: 'Text-only email' });
    return new Response('{"id":"fixture-only"}', { status: 200 });
  }) as typeof fetch;
  const message = { to: 'test@example.invalid', subject: 'Reset test', text: 'Text-only email' };
  await createEmailSender(environment, mockedFetch).send(message); assert.equal(calls, 1);
  await assert.rejects(createEmailSender(environment, (async () => new Response('{}', { status: 503 })) as typeof fetch).send(message), /rejected/);
});
