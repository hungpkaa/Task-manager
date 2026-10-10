import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../domain/errors.js';
import type { AccountRecord, AccountRepository } from '../repositories/accounts.js';
import { hashPassword, verifyPassword } from './password.js';
import { loginSchema, profileSchema, registrationSchema, validate } from './auth-validation.js';

export const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export function tokenHash(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return createHash('sha256').update(token).digest('hex');
}

function publicAccount(user: AccountRecord) {
  return {
    id: user.id, email: user.email, displayName: user.displayName,
    systemRole: user.systemRole, createdAt: user.createdAt.toISOString(),
  };
}

export function createAuthService(repository: AccountRepository) {
  async function authenticate(token: string | undefined) {
    const hash = tokenHash(token);
    const session = hash ? await repository.findSession(hash) : null;
    if (!session || session.expiresAt.getTime() <= Date.now() || session.user.status !== 'ACTIVE') {
      if (hash && session) await repository.deleteSession(hash);
      throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    return session.user;
  }

  return {
    async register(input: unknown, previousToken?: string) {
      const data = validate(registrationSchema, input);
      const passwordHash = await hashPassword(data.password);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + sessionLifetimeMs);
      try {
        const user = await repository.register({ email: data.email, displayName: data.displayName, passwordHash }, tokenHash(token)!, expiresAt, tokenHash(previousToken));
        return { user: publicAccount(user), token, expiresAt };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
          throw new HttpError(409, 'Email này đã được sử dụng.', { email: 'Email này đã được sử dụng.' });
        }
        throw error;
      }
    },
    async login(input: unknown, previousToken?: string) {
      const data = validate(loginSchema, input);
      const user = await repository.findByEmail(data.email);
      const valid = await verifyPassword(data.password, user?.passwordHash);
      if (!user || !valid) throw new HttpError(401, 'Email hoặc mật khẩu không đúng.');
      if (user.status !== 'ACTIVE') throw new HttpError(403, 'Tài khoản đang bị khóa.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + sessionLifetimeMs);
      await repository.createSession(user.id, tokenHash(token)!, expiresAt, tokenHash(previousToken), user.passwordHash);
      return { user: publicAccount(user), token, expiresAt };
    },
    async me(token: string | undefined) { return publicAccount(await authenticate(token)); },
    async updateProfile(token: string | undefined, input: unknown) {
      const user = await authenticate(token);
      const data = validate(profileSchema, input);
      return publicAccount(await repository.updateProfile(user.id, data.displayName));
    },
    async logout(token: string | undefined) {
      const hash = tokenHash(token);
      if (hash) await repository.deleteSession(hash);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
