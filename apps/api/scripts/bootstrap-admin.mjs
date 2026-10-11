import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { readConfig } from '../dist/config.js';
import { bootstrapAdmin } from '../dist/repositories/admin.js';
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage: npm.cmd run admin:bootstrap -- registered-email [--apply]\nWithout --apply, checks eligibility only. Requires npm.cmd run build first.');
} else if (args.length > 2 || (args[1] && args[1] !== '--apply')) {
  console.error('Expected one email and optional --apply.'); process.exitCode = 1;
} else {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: readConfig().databaseUrl }) });
  try {
    const user = await bootstrapAdmin(client, args[0].trim().toLowerCase(), args[1] === '--apply');
    console.log(`${args[1] === '--apply' ? 'Created first System Admin' : 'Eligible; rerun with --apply to provision'}: ${user.email}`);
  } catch (error) { console.error(error instanceof Error ? error.message : 'Bootstrap failed.'); process.exitCode = 1; }
  finally { await client.$disconnect(); }
}
