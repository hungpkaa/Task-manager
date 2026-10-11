import type { SprintService } from '../services/sprints.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';
export interface SprintOptions extends SessionOptions { service: SprintService; }
export function sprintRouter(options: SprintOptions) {
  const router = sessionRouter(options);
  const token = (cookie?: string) => readSessionToken(cookie, options.secureCookies);
  router.get('/projects/:projectId/sprints/:id/retrospective', async (req, res) => { res.json(await options.service.retrospective(token(req.headers.cookie), req.params.projectId, req.params.id)); });
  router.put('/projects/:projectId/sprints/:id/retrospective', async (req, res) => { res.json(await options.service.saveRetrospective(token(req.headers.cookie), req.params.projectId, req.params.id, req.body)); });
  router.get('/projects/:projectId/sprints/:id/review', async (req, res) => { res.json(await options.service.review(token(req.headers.cookie), req.params.projectId, req.params.id)); });
  router.put('/projects/:projectId/sprints/:id/review', async (req, res) => { res.json(await options.service.saveReview(token(req.headers.cookie), req.params.projectId, req.params.id, req.body)); });
  router.get('/projects/:projectId/sprints/:id/daily', async (req, res) => { res.json(await options.service.daily(token(req.headers.cookie), req.params.projectId, req.params.id, req.query)); });
  router.post('/projects/:projectId/sprints/:id/daily', async (req, res) => { res.status(201).json(await options.service.addDaily(token(req.headers.cookie), req.params.projectId, req.params.id, req.body)); });
  router.post('/projects/:projectId/sprints/:id/start', async (req, res) => { res.json(await options.service.start(token(req.headers.cookie), req.params.projectId, req.params.id, req.body)); });
  router.get('/projects/:projectId/sprints/:id/monitor', async (req, res) => { res.json(await options.service.monitor(token(req.headers.cookie), req.params.projectId, req.params.id, req.query)); });
  router.get('/projects/:projectId/sprints', async (req, res) => { res.json(await options.service.list(token(req.headers.cookie), req.params.projectId, req.query)); });
  router.get('/projects/:projectId/backlog', async (req, res) => { res.json(await options.service.backlog(token(req.headers.cookie), req.params.projectId, req.query)); });
  router.post('/projects/:projectId/sprints', async (req, res) => { res.status(201).json({ sprint: await options.service.create(token(req.headers.cookie), req.params.projectId, req.body) }); });
  router.post('/projects/:projectId/sprints/:id/plan', async (req, res) => { res.json(await options.service.plan(token(req.headers.cookie), req.params.projectId, req.params.id, req.body)); });
  router.post('/projects/:projectId/sprints/:id/tasks/:taskId/return', async (req, res) => { await options.service.returnTask(token(req.headers.cookie), req.params.projectId, req.params.id, req.params.taskId, req.body); res.status(204).end(); });
  return router;
}
