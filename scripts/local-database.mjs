import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Optional Windows fallback for local development when Docker is unavailable.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const local = join(root, '.local');
const data = join(local, 'postgres');
const action = process.argv[2];
const bin = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';

if (process.platform !== 'win32' || !['start', 'stop'].includes(action)) {
  console.error('Cách dùng trên Windows: node scripts/local-database.mjs start|stop. Hệ điều hành khác dùng Docker Compose.');
  process.exit(1);
}
if (!existsSync(join(bin, 'pg_ctl.exe'))) {
  console.error('Không tìm thấy PostgreSQL. Đặt PG_BIN trỏ đến thư mục bin hoặc dùng Docker Compose.');
  process.exit(1);
}

function run(command, args, extra = {}) {
  const result = spawnSync(join(bin, `${command}.exe`), args, { windowsHide: true, encoding: 'utf8', ...extra });
  if (result.error) throw result.error;
  return result;
}
function mustRun(command, args, extra) {
  // PostgreSQL is a background process: do not capture inherited pipe handles.
  const result = run(command, args, { ...extra, stdio: 'inherit' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${command} không thành công.`);
}

try {
  if (action === 'stop') {
    if (!existsSync(join(data, 'PG_VERSION')) || run('pg_ctl', ['-D', data, 'status']).status !== 0) {
      console.log('PostgreSQL riêng của dự án đã dừng.');
    } else {
      mustRun('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    }
  } else {
    process.loadEnvFile(join(root, '.env'));
    const password = process.env.POSTGRES_PASSWORD;
    if (!password || /[\r\n]/.test(password)) throw new Error('Cần POSTGRES_PASSWORD hợp lệ trong .env ở thư mục gốc.');
    mkdirSync(local, { recursive: true });
    if (!existsSync(join(data, 'PG_VERSION'))) {
      const passwordFile = join(local, 'initdb-password.txt');
      try {
        writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
        mustRun('initdb', ['-D', data, '-U', 'task_manager', `--pwfile=${passwordFile}`, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
      } finally {
        if (existsSync(passwordFile)) unlinkSync(passwordFile);
      }
    }
    if (run('pg_ctl', ['-D', data, 'status']).status !== 0) {
      mustRun('pg_ctl', ['-D', data, '-l', join(local, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55432', '-w', 'start']);
    }
    const env = { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: '5' };
    const args = ['-h', '127.0.0.1', '-p', '55432', '-U', 'task_manager'];
    const found = run('psql', [...args, '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'task_manager'"], { env });
    if (found.status !== 0) throw new Error('Không kết nối được PostgreSQL riêng của dự án. Kiểm tra mật khẩu và cổng 55432.');
    if (found.stdout.trim() !== '1') mustRun('createdb', [...args, 'task_manager'], { env });
    console.log('PostgreSQL riêng của dự án sẵn sàng tại 127.0.0.1:55432.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Không thể quản lý PostgreSQL cục bộ.');
  process.exitCode = 1;
}
