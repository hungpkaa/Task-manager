import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';
import { createDatabase } from '../dist/repositories/database.js';

const config = readConfig();
const name = `task_manager_migration_check_${randomUUID().replaceAll('-', '')}`;
assert.match(name, /^task_manager_migration_check_[0-9a-f]{32}$/);
const url = new URL(config.databaseUrl); url.pathname = `/${name}`;
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
let created = false;
let database;
let fresh;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, DATABASE_URL: url.href }, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Fresh database migrations failed.')));
  });
  database = createDatabase(url.href);
  fresh = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  const user = await fresh.user.create({ data: { email: 'migration-check@example.invalid', displayName: 'Migration check', passwordHash: 'fixture-only' } });
  const workspace = await database.workspaces.create(user.id, { name: 'Fresh workspace', description: '' });
  const project = await database.projects.create(workspace.id, user.id, { name: 'Fresh project', description: '', startDate: null, endDate: null });
  await database.projects.assignManager(project.id, user.id, user.id, null);
  const task = await database.tasks.create(project.id, user.id, { title: 'Fresh task', description: '', priority: 'HIGH', assigneeId: user.id, startDate: '2026-10-10', dueDate: '2026-10-20', effort: 3 });
  assert.equal(task.status, 'TODO'); assert.equal(task.sprintId, null);
  assert.equal(await fresh.notification.count({ where: { relatedEntityId: task.id } }), 1);
  await assert.rejects(fresh.task.update({ where: { id: task.id }, data: { dueDate: new Date('2026-10-01') } }));
  console.log('PASS: all migrations on a fresh PostgreSQL database; Workspace/Project/Task, notifications and date CHECK.');
} finally {
  try {
    await Promise.all([database?.disconnect(), fresh?.$disconnect()]);
    // Drop only the randomly named database that this invocation successfully created.
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  } finally { await admin.$disconnect(); }
}
