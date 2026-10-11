import type { AdminService } from '../services/admin.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';
export interface AdminOptions extends SessionOptions { service: AdminService; }
export function adminRouter(options: AdminOptions) {
  const router = sessionRouter(options); const token = (cookie?: string) => readSessionToken(cookie, options.secureCookies);
  router.get('/admin/users', async (req, res) => { res.json(await options.service.users(token(req.headers.cookie), req.query)); });
  router.get('/admin/workspaces', async (req, res) => { res.json(await options.service.workspaces(token(req.headers.cookie), req.query)); });
  router.get('/admin/statistics', async (req, res) => { res.json(await options.service.statistics(token(req.headers.cookie), req.query)); });
  router.patch('/admin/users/:id/status', async (req, res) => { res.json({ user: await options.service.changeStatus(token(req.headers.cookie), req.params.id, req.body) }); });
  return router;
}
