import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';
import { createDatabase } from '../dist/repositories/database.js';
import { createPasswordResetService } from '../dist/services/password-resets.js';
import { tokenHash } from '../dist/services/auth.js';

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
  const sprint = await database.sprints.create(project.id, user.id, { name: 'Fresh Sprint', goal: 'Validate planning', startDate: '2026-10-11', endDate: '2026-10-25' });
  assert.equal(sprint.status, 'PLANNED');
  const planned = await database.sprints.plan(project.id, user.id, sprint.id, { tasks: [{ id: task.id, updatedAt: task.updatedAt.toISOString() }], confirmed: true });
  assert.equal(planned.applied, true);
  assert.equal((await fresh.task.findUniqueOrThrow({ where: { id: task.id } })).sprintId, sprint.id);
  const started = await database.sprints.start(project.id, user.id, sprint.id, sprint.updatedAt.toISOString(), true);
  assert.equal(started.sprint.status, 'ACTIVE'); assert.ok(started.sprint.startedAt);
  assert.equal((await database.sprints.monitor(project.id, user.id, sprint.id, { page: 1 })).summary.total, 1);
  await database.sprints.addDaily(project.id, user.id, sprint.id, { progress: 'Fresh progress', nextPlan: 'Fresh plan', blockers: '' });
  assert.equal((await database.sprints.daily(project.id, user.id, sprint.id, 1)).total, 1);
  await database.sprints.saveReview(project.id, user.id, sprint.id, { summary: 'Fresh summary', feedback: 'Fresh feedback', expectedUpdatedAt: null });
  assert.equal((await database.sprints.review(project.id, user.id, sprint.id)).review.incompleteCount, 1);
  await database.sprints.saveRetrospective(project.id, user.id, sprint.id, { wentWell: 'Fresh collaboration', needsImprovement: 'Fresh improvements', actionItems: 'Fresh actions', expectedUpdatedAt: null });
  assert.equal((await database.sprints.retrospective(project.id, user.id, sprint.id)).retrospective.actionItems, 'Fresh actions');
  const finish = await database.sprints.finishPreview(project.id, user.id, sprint.id);
  await database.sprints.finish(project.id, user.id, sprint.id, { expectedSnapshot: finish.snapshot, destinationSprintId: null, confirmed: true });
  assert.equal((await fresh.sprint.findUniqueOrThrow({ where: { id: sprint.id } })).status, 'COMPLETED');
  assert.equal(await fresh.notification.count({ where: { relatedEntityId: task.id } }), 1);
  const comment = await database.tasks.addComment(task.id, user.id, `Fresh comment @{${user.email}} @{${user.email}}`);
  assert.equal(comment.mentions.length, 1);
  assert.equal(await fresh.commentMention.count({ where: { commentId: comment.id } }), 1);
  await assert.rejects(fresh.comment.create({ data: { taskId: task.id, authorId: user.id, body: '' } }));
  const bytes = Buffer.from('Fresh attachment');
  const attachment = await database.tasks.addAttachment(task.id, user.id, 'fresh.txt', bytes);
  const downloaded = await database.tasks.downloadAttachment(task.id, attachment.id, user.id);
  assert.deepEqual(Buffer.from(downloaded.data), bytes);
  await assert.rejects(fresh.attachment.create({ data: { taskId: task.id, uploadedBy: user.id, filename: 'bad.txt', sizeBytes: 1, data: new Uint8Array() } }));
  let resetEmail;
  const recovery = createPasswordResetService(database.passwordResets, { enabled: true, async send(message) { resetEmail = message; } }, config.appOrigin);
  await recovery.forgot({ email: user.email });
  const resetToken = new URL(resetEmail.text.match(/https?:\/\/\S+/)[0]).hash.slice('#reset='.length);
  assert.equal(await fresh.passwordResetToken.count({ where: { tokenHash: tokenHash(resetToken) } }), 1);
  await recovery.reset({ token: resetToken, password: 'fresh migration reset passphrase' });
  assert.equal(await fresh.passwordResetToken.count({ where: { userId: user.id } }), 0);
  await assert.rejects(fresh.task.update({ where: { id: task.id }, data: { dueDate: new Date('2026-10-01') } }));
  console.log('PASS: all migrations on a fresh PostgreSQL database; Workspace/Project/Task, Sprint planning, comments/mentions, attachment bytes, password reset, notifications and CHECK constraints.');
} finally {
  try {
    await Promise.all([database?.disconnect(), fresh?.$disconnect()]);
    // Drop only the randomly named database that this invocation successfully created.
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  } finally { await admin.$disconnect(); }
}
