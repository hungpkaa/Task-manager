import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(process.env.MAIL_DIRECTORY ?? fileURLToPath(new URL('../.local/mail', import.meta.url)));
let files;
try { files = await readdir(directory); }
catch (error) { if (error.code === 'ENOENT') { console.log('Hộp thư thử chưa có email.'); process.exit(0); } throw error; }
const recipient = process.argv[2]?.toLowerCase();
const messages = [];
for (const file of files.filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))) {
  const message = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
  if (!recipient || message.to.toLowerCase() === recipient) messages.push(message);
}
messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
for (const message of messages.slice(0, 10)) console.log(`\n${message.createdAt} · ${message.to}\n${message.subject}\n${message.text}\n`);
if (!messages.length) console.log('Không có email phù hợp trong hộp thư thử.');
