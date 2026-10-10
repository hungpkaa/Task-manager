import { Router, type CookieOptions, type Response } from 'express';
import { parse } from 'cookie';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../domain/errors.js';
import { sessionLifetimeMs, type AuthService } from '../services/auth.js';
import type { PasswordResetService } from '../services/password-resets.js';

export interface AuthOptions {
  service: AuthService;
  appOrigin: string;
  secureCookies: boolean;
  rateLimit?: number;
  passwordResets?: PasswordResetService;
}

export function authRouter(options: AuthOptions) {
  const router = Router();
  const cookieName = options.secureCookies ? '__Host-task_manager_session' : 'task_manager_session';
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: options.secureCookies, path: '/' };
  const readToken = (cookie: string | undefined) => parse(cookie ?? '')[cookieName];
  const sessionResponse = (response: Response, result: Awaited<ReturnType<AuthService['login']>>, status = 200) => {
    response.cookie(cookieName, result.token, { ...cookieOptions, maxAge: sessionLifetimeMs, expires: result.expiresAt });
    response.status(status).json({ user: result.user });
  };

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.get('Origin') !== options.appOrigin) {
        throw new HttpError(403, 'Nguồn yêu cầu không được phép.');
      }
      if (!request.is('application/json')) throw new HttpError(415, 'Yêu cầu cần sử dụng JSON.');
    }
    next();
  });

  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.rateLimit ?? 20,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.' },
  });

  router.post('/register', limit, async (request, response) => {
    sessionResponse(response, await options.service.register(request.body, readToken(request.headers.cookie)), 201);
  });
  router.post('/login', limit, async (request, response) => {
    sessionResponse(response, await options.service.login(request.body, readToken(request.headers.cookie)));
  });
  if (options.passwordResets) {
    const resetLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: options.rateLimit ?? 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.' } });
    router.post('/password/forgot', resetLimit, async (request, response) => { response.status(202).json(await options.passwordResets!.forgot(request.body)); });
    router.post('/password/reset', resetLimit, async (request, response) => { const result = await options.passwordResets!.reset(request.body); response.clearCookie(cookieName, cookieOptions).json(result); });
  }
  router.post('/logout', async (request, response) => {
    await options.service.logout(readToken(request.headers.cookie));
    response.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  router.get('/me', async (request, response) => {
    response.json({ user: await options.service.me(readToken(request.headers.cookie)) });
  });
  router.patch('/me', async (request, response) => {
    response.json({ user: await options.service.updateProfile(readToken(request.headers.cookie), request.body) });
  });

  // Expired or revoked sessions are removed from the browser as well.
  router.use((error: unknown, request: import('express').Request, response: Response, next: import('express').NextFunction) => {
    if (error instanceof HttpError && error.status === 401 && request.path === '/me') response.clearCookie(cookieName, cookieOptions);
    next(error);
  });
  return router;
}
