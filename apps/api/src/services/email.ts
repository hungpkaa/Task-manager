import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

export interface Email { to: string; subject: string; text: string; }
export interface EmailSender { enabled: boolean; local?: boolean; send(email: Email): Promise<void>; }
export function createEmailSender(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): EmailSender {
  const production = environment.NODE_ENV === 'production';
  const mode = environment.MAIL_MODE ?? (production ? 'disabled' : 'file');
  if (!['file', 'resend', 'smtp', 'disabled'].includes(mode)) throw new Error('MAIL_MODE phải là file, resend, smtp hoặc disabled.');
  if (production && mode === 'file') throw new Error('Không dùng hộp thư thử trong production.');
  const directory = resolve(environment.MAIL_DIRECTORY ?? fileURLToPath(new URL('../../../../.local/mail', import.meta.url)));
  const key = environment.RESEND_API_KEY; const from = environment.MAIL_FROM;
  if (mode === 'resend' && (!key || !from || /[\r\n]/.test(from))) throw new Error('Cần RESEND_API_KEY và MAIL_FROM hợp lệ.');
  const smtpUser = environment.SMTP_USER; const smtpPass = environment.SMTP_PASS;
  if (mode === 'smtp' && (!smtpUser || !smtpPass)) throw new Error('Cần SMTP_USER và SMTP_PASS khi dùng MAIL_MODE=smtp.');
  const transporter = mode === 'smtp' ? nodemailer.createTransport({
    host: environment.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(environment.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  }) : null;
  return {
    enabled: mode !== 'disabled',
    local: mode === 'file',
    async send(email) {
      if (mode === 'disabled') throw new Error('Email delivery is disabled.');
      if (mode === 'file') {
        await mkdir(directory, { recursive: true });
        await writeFile(resolve(directory, `${randomUUID()}.json`), JSON.stringify({ ...email, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
        return;
      }
      if (mode === 'smtp') {
        await transporter!.sendMail({ from: smtpUser, to: email.to, subject: email.subject, text: email.text });
        return;
      }
      const result = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }), signal: AbortSignal.timeout(10_000) });
      if (!result.ok) throw new Error('Email provider rejected delivery.');
    },
  };
}
