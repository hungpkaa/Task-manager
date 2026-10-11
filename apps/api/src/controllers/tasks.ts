import type { TaskService } from '../services/tasks.js';
import { Router, raw } from 'express';
import { HttpError } from '../domain/errors.js';
import { maxAttachmentBytes } from '../services/attachment-validation.js';
import { readSessionToken, sessionRouter, type SessionOptions } from './session.js';
export interface TaskOptions extends SessionOptions { service: TaskService; }
export function taskRouter(options: TaskOptions) {
  const router = Router();
  const token = (cookie?: string) => readSessionToken(cookie, options.secureCookies);
  router.post('/tasks/:id/attachments', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('Origin') !== options.appOrigin) throw new HttpError(403, 'Nguồn yêu cầu không được phép.');
    if (!req.is('application/octet-stream') || req.get('Content-Encoding')) throw new HttpError(415, 'Tải tệp bằng application/octet-stream, không nén yêu cầu.');
    await options.service.attachmentAccess(token(req.headers.cookie), req.params.id, req.get('X-Filename'));
    next();
  }, raw({ type: 'application/octet-stream', limit: maxAttachmentBytes, inflate: false }), async (req, res) => {
    res.status(201).json({ attachment: await options.service.addAttachment(token(req.headers.cookie), req.params.id, req.get('X-Filename'), req.body) });
  });
  router.use(sessionRouter(options));
  router.get('/tasks/:id/attachments', async (req, res) => { res.json(await options.service.attachments(token(req.headers.cookie), req.params.id, req.query)); });
  router.get('/tasks/:id/attachments/:attachmentId/download', async (req, res) => {
    const attachment = await options.service.downloadAttachment(token(req.headers.cookie), req.params.id, req.params.attachmentId);
    res.attachment(attachment.filename).type('application/octet-stream').send(Buffer.from(attachment.data));
  });
  router.delete('/tasks/:id/attachments/:attachmentId', async (req, res) => { await options.service.removeAttachment(token(req.headers.cookie), req.params.id, req.params.attachmentId); res.status(204).end(); });
  router.get('/tasks/:id/dependencies', async (req, res) => { res.json(await options.service.dependencies(token(req.headers.cookie), req.params.id, req.query)); });
  router.post('/tasks/:id/dependencies', async (req, res) => { await options.service.addDependency(token(req.headers.cookie), req.params.id, req.body); res.status(201).json({ added: true }); });
  router.delete('/tasks/:id/dependencies/:dependsOnTaskId', async (req, res) => { await options.service.removeDependency(token(req.headers.cookie), req.params.id, req.params.dependsOnTaskId); res.status(204).end(); });
  router.get('/tasks/:id/comments', async (req, res) => { res.json(await options.service.comments(token(req.headers.cookie), req.params.id, req.query)); });
  router.post('/tasks/:id/comments', async (req, res) => { res.status(201).json({ comment: await options.service.addComment(token(req.headers.cookie), req.params.id, req.body) }); });
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
