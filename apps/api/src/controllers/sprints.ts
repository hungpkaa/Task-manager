import type { SprintService } from '../services/sprints.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';
export interface SprintOptions extends SessionOptions { service: SprintService; }
export function sprintRouter(options: SprintOptions) {
  const router = sessionRouter(options);
  const token = (cookie?: string) => readSessionToken(cookie, options.secureCookies);
  router.get('/projects/:projectId/sprints', async (req, res) => { res.json(await options.service.list(token(req.headers.cookie), req.params.projectId, req.query)); });
  router.get('/projects/:projectId/backlog', async (req, res) => { res.json(await options.service.backlog(token(req.headers.cookie), req.params.projectId, req.query)); });
  router.post('/projects/:projectId/sprints', async (req, res) => { res.status(201).json({ sprint: await options.service.create(token(req.headers.cookie), req.params.projectId, req.body) }); });
  router.post('/projects/:projectId/sprints/:id/plan', async (req, res) => { res.json(await options.service.plan(token(req.headers.cookie), req.params.projectId, req.params.id, req.body)); });
  router.post('/projects/:projectId/sprints/:id/tasks/:taskId/return', async (req, res) => { await options.service.returnTask(token(req.headers.cookie), req.params.projectId, req.params.id, req.params.taskId, req.body); res.status(204).end(); });
  return router;
}
