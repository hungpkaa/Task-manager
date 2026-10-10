import type { ProjectService } from '../services/projects.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';

export interface ProjectOptions extends SessionOptions { service: ProjectService; }
export function projectRouter(options: ProjectOptions) {
  const router = sessionRouter(options);
  const token = (cookie?: string) => readSessionToken(cookie, options.secureCookies);
  router.get('/workspaces/:workspaceId/projects', async (req, res) => { res.json({ projects: await options.service.list(token(req.headers.cookie), req.params.workspaceId) }); });
  router.post('/workspaces/:workspaceId/projects', async (req, res) => { res.status(201).json({ project: await options.service.create(token(req.headers.cookie), req.params.workspaceId, req.body) }); });
  router.get('/projects/:id', async (req, res) => { res.json({ project: await options.service.detail(token(req.headers.cookie), req.params.id) }); });
  router.patch('/projects/:id', async (req, res) => { res.json({ project: await options.service.update(token(req.headers.cookie), req.params.id, req.body) }); });
  router.patch('/projects/:id/manager', async (req, res) => { res.json({ project: await options.service.assignManager(token(req.headers.cookie), req.params.id, req.body) }); });
  router.post('/projects/:id/close', async (req, res) => { res.json({ project: await options.service.close(token(req.headers.cookie), req.params.id) }); });
  router.get('/projects/:id/members', async (req, res) => { res.json({ members: await options.service.members(token(req.headers.cookie), req.params.id) }); });
  router.post('/projects/:id/members', async (req, res) => { res.status(201).json({ member: await options.service.addMember(token(req.headers.cookie), req.params.id, req.body) }); });
  router.delete('/projects/:id/members/:userId', async (req, res) => { await options.service.removeMember(token(req.headers.cookie), req.params.id, req.params.userId); res.status(204).end(); });
  return router;
}
