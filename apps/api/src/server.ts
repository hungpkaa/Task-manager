import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './repositories/database.js';
import { createAuthService } from './services/auth.js';
import { createWorkspaceService, createNotificationService } from './services/workspaces.js';
import { createProjectService } from './services/projects.js';

const config = readConfig();
const database = createDatabase(config.databaseUrl);
const auth = createAuthService(database.accounts);
const server = createApp(database, {
  service: auth,
  appOrigin: config.appOrigin,
  secureCookies: config.secureCookies,
}, {
  service: createWorkspaceService(database.workspaces, auth),
  notifications: createNotificationService(database.notifications, auth),
  appOrigin: config.appOrigin,
  secureCookies: config.secureCookies,
}, {
  service: createProjectService(database.projects, auth),
  appOrigin: config.appOrigin,
  secureCookies: config.secureCookies,
}).listen(config.port, config.host, () => {
  console.log(`Task Manager API: http://${config.host}:${config.port}`);
});

server.on('error', async (error) => {
  console.error('Không thể mở cổng API:', error.message);
  await database.disconnect();
  process.exitCode = 1;
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(async () => {
    try {
      await database.disconnect();
    } finally {
      clearTimeout(timeout);
    }
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
