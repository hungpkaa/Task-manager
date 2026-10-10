import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../domain/errors.js';
import type { PasswordResetRepository } from '../repositories/password-resets.js';
import type { EmailSender } from './email.js';
import { registrationSchema, validate } from './auth-validation.js';
import { tokenHash } from './auth.js';
import { hashPassword } from './password.js';

export const forgotMessage = 'Nếu email thuộc tài khoản đang hoạt động, bạn sẽ nhận được liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.';
const forgotSchema = registrationSchema.pick({ email: true });
const resetSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết không hợp lệ.'), password: registrationSchema.shape.password }).strict();
export function createPasswordResetService(repository: PasswordResetRepository, sender: EmailSender, appOrigin: string) {
  return {
    async forgot(input: unknown) {
      const { email } = validate(forgotSchema, input);
      if (!sender.enabled) throw new HttpError(503, 'Chức năng gửi email chưa sẵn sàng. Vui lòng thử lại sau.');
      const token = randomBytes(32).toString('base64url'); const hash = tokenHash(token)!;
      const user = await repository.issue(email, hash, new Date(Date.now() + 30 * 60_000));
      if (user) {
        const link = `${appOrigin}/#reset=${token}`;
        try { await sender.send({ to: user.email, subject: 'Đặt lại mật khẩu Task Manager', text: `Bạn đã yêu cầu đặt lại mật khẩu Task Manager.\n\n${link}\n\nLiên kết dùng một lần và hết hạn sau 30 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.` }); }
        catch { await repository.discard(hash); console.error('Không gửi được email đặt lại mật khẩu; token đã thu hồi.'); }
      }
      return { message: forgotMessage };
    },
    async reset(input: unknown) {
      const data = validate(resetSchema, input);
      const passwordHash = await hashPassword(data.password);
      if (!await repository.consume(tokenHash(data.token)!, passwordHash)) throw new HttpError(400, 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.');
      return { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại; các phiên cũ đã được thu hồi.' };
    },
  };
}
export type PasswordResetService = ReturnType<typeof createPasswordResetService>;
