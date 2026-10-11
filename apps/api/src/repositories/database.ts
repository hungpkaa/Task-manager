import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { createAccountRepository } from './accounts.js';
import { createWorkspaceRepository } from './workspaces.js';
import { createNotificationRepository } from './notifications.js';
import { createProjectRepository } from './projects.js';
import { createTaskRepository } from './tasks.js';
import { createPasswordResetRepository } from './password-resets.js';
import { createSprintRepository } from './sprints.js';
import { createAdminRepository } from './admin.js';

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    max: 5,
  });
  const client = new PrismaClient({ adapter });
  return {
    accounts: createAccountRepository(client),
    passwordResets: createPasswordResetRepository(client),
    workspaces: createWorkspaceRepository(client),
    notifications: createNotificationRepository(client),
    projects: createProjectRepository(client),
    tasks: createTaskRepository(client),
    sprints: createSprintRepository(client),
    admin: createAdminRepository(client),
    async checkConnection() {
      await client.$queryRaw`SELECT 1`;
    },
    disconnect: () => client.$disconnect(),
  };
}
