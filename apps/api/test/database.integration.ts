import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { readConfig } from '../src/config.js';

test('real PostgreSQL supports Prisma write/read, unique email and transaction rollback', async () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: readConfig().databaseUrl, connectionTimeoutMillis: 3000 }),
  });
  const email = `foundation-${randomUUID()}@example.invalid`;
  const rollback = new Error('intentional-test-rollback');
  try {
    await assert.rejects(client.$transaction(async (transaction) => {
      const user = await transaction.user.create({ data: {
        email, displayName: 'Kiểm thử nền tảng', passwordHash: 'test-placeholder-not-a-real-account',
      } });
      const stored = await transaction.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(stored.email, email);
      assert.equal(stored.displayName, 'Kiểm thử nền tảng');
      throw rollback;
    }), (error: unknown) => error === rollback);
    assert.equal(await client.user.findUnique({ where: { email } }), null);

    await assert.rejects(client.$transaction(async (transaction) => {
      const data = { email, displayName: 'Kiểm thử unique', passwordHash: 'test-placeholder' };
      await transaction.user.create({ data });
      await transaction.user.create({ data });
    }), (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002');
    assert.equal(await client.user.findUnique({ where: { email } }), null);
  } finally {
    await client.$disconnect();
  }
});
