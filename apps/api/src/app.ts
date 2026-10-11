import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { checkReadiness, type DatabaseHealth } from './services/health.js';
import { HttpError } from './domain/errors.js';
import { authRouter, type AuthOptions } from './controllers/auth.js';
import { workspaceRouter, notificationRouter, type WorkspaceOptions } from './controllers/workspaces.js';
import { projectRouter, type ProjectOptions } from './controllers/projects.js';
import { taskRouter, type TaskOptions } from './controllers/tasks.js';
import { sprintRouter, type SprintOptions } from './controllers/sprints.js';
import { adminRouter, type AdminOptions } from './controllers/admin.js';

export function createApp(database: DatabaseHealth, auth?: AuthOptions, workspaces?: WorkspaceOptions, projects?: ProjectOptions, tasks?: TaskOptions, sprints?: SprintOptions, admin?: AdminOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'task-manager-api' });
  });

  app.get('/api/health/ready', async (_request, response) => {
    const result = await checkReadiness(database);
    response.set('Cache-Control', 'no-store').status(result.status === 'ok' ? 200 : 503).json(result);
  });

  if (auth) app.use('/api/auth', authRouter(auth));
  if (tasks) app.use('/api', taskRouter(tasks));
  if (sprints) app.use('/api', sprintRouter(sprints));
  if (projects) app.use('/api', projectRouter(projects));
  if (admin) app.use('/api', adminRouter(admin));
  if (workspaces) {
    app.use('/api/workspaces', workspaceRouter(workspaces));
    app.use('/api/notifications', notificationRouter(workspaces));
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Không tìm thấy API này.' });
  });

  const onError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ message: error.message, ...(error.fields ? { fields: error.fields } : {}) });
      return;
    }
    const isBadJson = error instanceof SyntaxError && 'status' in error && error.status === 400;
    const tooLarge = typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
    response.status(isBadJson ? 400 : tooLarge ? 413 : 500).json({
      message: isBadJson ? 'JSON không hợp lệ.' : tooLarge ? 'Dữ liệu yêu cầu quá lớn.' : 'Không thể xử lý yêu cầu. Vui lòng thử lại sau.',
    });
  };
  app.use(onError);
  return app;
}
