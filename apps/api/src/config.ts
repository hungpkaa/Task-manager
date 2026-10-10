import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const port = Number(environment.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error('Thiếu DATABASE_URL. Hãy tạo apps/api/.env từ .env.example.');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL không phải URL hợp lệ.');
  }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL phải sử dụng PostgreSQL.');
  }
  const secureCookies = environment.NODE_ENV === 'production';
  const appOrigin = environment.APP_ORIGIN ?? 'http://127.0.0.1:5173';
  let origin: URL;
  try { origin = new URL(appOrigin); } catch { throw new Error('APP_ORIGIN không hợp lệ.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('APP_ORIGIN phải là nguồn HTTP/HTTPS, không kèm đường dẫn.');
  }
  if (secureCookies && origin.protocol !== 'https:') throw new Error('APP_ORIGIN phải dùng HTTPS khi chạy production.');
  return { host: environment.HOST ?? '127.0.0.1', port, databaseUrl, appOrigin: origin.origin, secureCookies };
}
