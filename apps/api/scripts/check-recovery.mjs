import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

// Called only with the disposable database created by check-fresh-database.
export async function checkRecovery(sourceUrl, source) {
  const connection = new URL(sourceUrl);
  assert.match(connection.pathname, /^\/task_manager_migration_check_[0-9a-f]{32}$/);
  const name = `task_manager_recovery_check_${randomUUID().replaceAll('-', '')}`;
  const restoredUrl = new URL(sourceUrl); restoredUrl.pathname = `/${name}`;
  const directory = await mkdtemp(join(tmpdir(), 'task-manager-recovery-'));
  const archive = join(directory, 'fixture.dump');
  const bin = process.env.PG_BIN;
  const tool = (name) => bin ? join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : process.platform === 'win32' ? join('C:\\Program Files\\PostgreSQL\\18\\bin', `${name}.exe`) : name;
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(connection.password), PGCONNECT_TIMEOUT: '10' };
  const args = ['--host', connection.hostname, '--port', connection.port || '5432', '--username', decodeURIComponent(connection.username), '--no-password'];
  function run(command, extra) {
    return new Promise((resolve, reject) => {
      const child = spawn(tool(command), [...args, ...extra], { env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
      child.once('error', () => reject(new Error(`${command} could not start; configure PG_BIN with PostgreSQL client tools.`)));
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}).`)));
    });
  }
  async function snapshot(client) {
    const tables = await client.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const result = {};
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-zA-Z_][a-zA-Z0-9_]*$/);
      const rows = await client.$queryRawUnsafe(`SELECT to_jsonb(t)::text AS payload FROM public."${tablename}" t`);
      const payloads = rows.map((row) => row.payload).sort();
      result[tablename] = { count: rows.length, hash: createHash('sha256').update(JSON.stringify(payloads)).digest('hex') };
    }
    return result;
  }
  let created = false; let restored;
  try {
    const expected = await snapshot(source);
    await run('pg_dump', ['--dbname', connection.pathname.slice(1), '--format=custom', '--no-owner', '--no-acl', '--file', archive]);
    await source.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    await run('pg_restore', ['--dbname', name, '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', archive]);
    restored = new PrismaClient({ adapter: new PrismaPg({ connectionString: restoredUrl.href }) });
    assert.deepEqual(await snapshot(restored), expected, 'Every public table and row must survive dump/restore exactly, including attachment bytes and migrations.');
    const task = await restored.task.findFirstOrThrow();
    await assert.rejects(restored.task.update({ where: { id: task.id }, data: { dueDate: new Date('2026-10-01') } }));
    console.log(`PASS: pg_dump/pg_restore round trip; ${Object.keys(expected).length} tables have identical row counts and data hashes; restored CHECK constraint rejects invalid deadline.`);
  } finally {
    await restored?.$disconnect();
    try { if (created) await source.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
}
