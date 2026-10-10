import type { TaskService } from '../services/tasks.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';
export interface TaskOptions extends SessionOptions { service: TaskService; }
export function taskRouter(options: TaskOptions) {
  const router = sessionRouter(options);
  const token = (cookie?: string) => readSessionToken(cookie, options.secureCookies);
  router.get('/projects/:projectId/tasks', async (req, res) => { res.json(await options.service.list(token(req.headers.cookie), req.params.projectId, req.query)); });
  router.post('/projects/:projectId/tasks', async (req, res) => { res.status(201).json({ task: await options.service.create(token(req.headers.cookie), req.params.projectId, req.body) }); });
  router.get('/tasks/mine', async (req, res) => { res.json(await options.service.myTasks(token(req.headers.cookie), req.query)); });
  router.get('/tasks/:id', async (req, res) => { res.json({ task: await options.service.detail(token(req.headers.cookie), req.params.id) }); });
  router.patch('/tasks/:id', async (req, res) => { res.json({ task: await options.service.update(token(req.headers.cookie), req.params.id, req.body) }); });
  router.patch('/tasks/:id/assignee', async (req, res) => { res.json({ task: await options.service.assign(token(req.headers.cookie), req.params.id, req.body) }); });
  router.patch('/tasks/:id/status', async (req, res) => { res.json(await options.service.status(token(req.headers.cookie), req.params.id, req.body)); });
  router.delete('/tasks/:id', async (req, res) => { await options.service.remove(token(req.headers.cookie), req.params.id); res.status(204).end(); });
  return router;
}
