import { parse } from 'cookie';
import { Router } from 'express';
import { HttpError } from '../domain/errors.js';

export interface SessionOptions { appOrigin: string; secureCookies: boolean; }

export function readSessionToken(cookie: string | undefined, secureCookies: boolean) {
  return parse(cookie ?? '')[secureCookies ? '__Host-task_manager_session' : 'task_manager_session'];
}

export function sessionRouter(options: SessionOptions) {
  const router = Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.get('Origin') !== options.appOrigin) throw new HttpError(403, 'Nguồn yêu cầu không được phép.');
      if (!request.is('application/json')) throw new HttpError(415, 'Yêu cầu cần sử dụng JSON.');
    }
    next();
  });
  return router;
}
