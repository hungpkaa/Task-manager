import type { WorkspaceService, NotificationService } from '../services/workspaces.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';
import { rateLimit } from 'express-rate-limit';

export interface WorkspaceOptions extends SessionOptions { service: WorkspaceService; notifications: NotificationService; }

export function workspaceRouter(options: WorkspaceOptions) {
  const router = sessionRouter(options);
  const token = (cookie: string | undefined) => readSessionToken(cookie, options.secureCookies);
  router.get('/', async (request, response) => { response.json({ workspaces: await options.service.list(token(request.headers.cookie)) }); });
  router.post('/', async (request, response) => { response.status(201).json({ workspace: await options.service.create(token(request.headers.cookie), request.body) }); });
  // Specific routes before /:id parameter routes
  router.get('/invitations/me', async (request, response) => { response.json({ invitations: await options.service.myInvitations(token(request.headers.cookie)) }); });
  router.post('/invitations/:id/accept', async (request, response) => { response.json({ workspace: await options.service.acceptInvitation(token(request.headers.cookie), request.params.id) }); });
  router.post('/invitations/:id/decline', async (request, response) => { response.json(await options.service.declineInvitation(token(request.headers.cookie), request.params.id)); });
  router.get('/:id', async (request, response) => { response.json({ workspace: await options.service.detail(token(request.headers.cookie), request.params.id) }); });
  router.patch('/:id', async (request, response) => { response.json({ workspace: await options.service.update(token(request.headers.cookie), request.params.id, request.body) }); });
  router.post('/:id/close', async (request, response) => { response.json({ workspace: await options.service.close(token(request.headers.cookie), request.params.id) }); });
  router.post('/:id/reopen', async (request, response) => { response.json({ workspace: await options.service.reopen(token(request.headers.cookie), request.params.id) }); });
  router.get('/:id/members', async (request, response) => { response.json({ members: await options.service.members(token(request.headers.cookie), request.params.id) }); });
  router.post('/:id/members', async (request, response) => { response.status(201).json({ member: await options.service.invite(token(request.headers.cookie), request.params.id, request.body) }); });
  const emailLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Bạn đã gửi lại quá nhiều email. Vui lòng thử lại sau 15 phút.' } });
  router.post('/:id/members/:userId/email', emailLimit, async (request, response) => { response.json(await options.service.resendInvitation(token(request.headers.cookie), request.params.id, request.params.userId)); });
  router.get('/:id/invitations', async (request, response) => { response.json({ invitations: await options.service.pendingInvitations(token(request.headers.cookie), request.params.id) }); });
  router.post('/:id/invitations', async (request, response) => { response.status(201).json({ invitation: await options.service.invite(token(request.headers.cookie), request.params.id, request.body) }); });
  router.post('/:id/invitations/:invitationId/resend', emailLimit, async (request, response) => { response.json(await options.service.resendInvitation(token(request.headers.cookie), request.params.id, request.params.invitationId)); });
  router.delete('/:id/invitations/:invitationId', async (request, response) => {
    await options.service.cancelInvitation(token(request.headers.cookie), request.params.id, request.params.invitationId);
    response.status(204).end();
  });
  router.patch('/:id/members/:userId', async (request, response) => { response.json({ member: await options.service.changeRole(token(request.headers.cookie), request.params.id, request.params.userId, request.body) }); });
  router.delete('/:id/members/:userId', async (request, response) => {
    await options.service.removeMember(token(request.headers.cookie), request.params.id, request.params.userId);
    response.status(204).end();
  });
  return router;
}

export function notificationRouter(options: WorkspaceOptions) {
  const router = sessionRouter(options);
  const token = (cookie: string | undefined) => readSessionToken(cookie, options.secureCookies);
  router.get('/', async (request, response) => { response.json(await options.notifications.list(token(request.headers.cookie), request.query)); });
  router.patch('/:id/read', async (request, response) => { response.json({ notification: await options.notifications.markRead(token(request.headers.cookie), request.params.id) }); });
  return router;
}
