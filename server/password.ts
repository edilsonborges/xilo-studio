import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const OPTIONS = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const PREFIX = 'scrypt$32768$8$3$';
const dummySalt = randomBytes(16);
const dummyKey = randomBytes(32);

export function validPasswordInput(password: string): boolean {
  const bytes = Buffer.byteLength(password, 'utf8');
  return bytes > 0 && bytes <= 1024 && !/[\r\n\0]/u.test(password);
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function isPasswordHash(value: unknown): value is string {
  return typeof value === 'string'
    && /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(value);
}

export async function hashPassword(password: string): Promise<string> {
  if (!validPasswordInput(password)) throw new Error('Senha inválida para configuração.');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!validPasswordInput(password)) return false;
  const valid = isPasswordHash(encoded);
  const pieces = valid ? encoded.split('$') : [];
  const salt = valid ? Buffer.from(pieces[4], 'base64url') : dummySalt;
  const expected = valid ? Buffer.from(pieces[5], 'base64url') : dummyKey;
  // Unknown accounts and unconfigured hashes still perform the same expensive work.
  const actual = await derive(password, salt);
  const matches = timingSafeEqual(actual, expected);
  return valid && matches;
}
