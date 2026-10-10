import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const cost = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const dummyHash = `scrypt$131072$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, cost, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string | undefined) {
  const valid = typeof hash === 'string' && /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);
  const parts = (valid ? hash : dummyHash).split('$');
  const expected = Buffer.from(parts[5]!, 'hex');
  const actual = await derive(password, Buffer.from(parts[4]!, 'hex'));
  return timingSafeEqual(expected, actual) && valid;
}
