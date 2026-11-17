import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword, isPasswordHash, verifyPassword } from './password.js';

export const SESSION_TTL = 30 * 24 * 60 * 60_000;
export const INVITE_TTL = 7 * 24 * 60 * 60_000;
export const RESET_TTL = 60 * 60_000;
export const LIMIT_WINDOW = 15 * 60_000;
export const LOGIN_EMAIL_LIMIT = 10;
export const LOGIN_IP_LIMIT = 100;
export const RESET_EMAIL_LIMIT = 3;
export const RESET_IP_LIMIT = 20;
export const TOKEN_IP_LIMIT = 30;
/** Narrações por pessoa a cada 15 minutos (o Edge TTS é um serviço gratuito e não oficial). */
export const NARRATION_LIMIT = 20;
/** Pedidos à IA por pessoa a cada 15 minutos (consomem o plano do ChatGPT). */
export const AI_TEXT_LIMIT = 40;
export const AI_IMAGE_LIMIT = 60;

export type TokenPurpose = 'invite' | 'reset';

export interface User { id: string; name: string; email: string; admin: boolean }

export interface UserSummary extends User {
  hasPassword: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  /** Validade do link de acesso pendente, se houver. */
  pendingLinkExpiresAt: number | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  created_at: number;
  last_login_at: number | null;
}

export interface Failure { ok: false; status: number; error: string; retryAfter?: number }

export const invalidCredentials = (): Failure => ({ ok: false, status: 401, error: 'E-mail ou senha inválidos.' });
export const invalidLink = (): Failure => ({ ok: false, status: 400, error: 'Este link é inválido ou já expirou. Peça um novo.' });

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const newToken = (): string => randomBytes(32).toString('base64url');

export class AuthStore {
  private readonly db: Database.Database;
  private readonly admins: Set<string>;

  constructor(databasePath: string, adminEmails: string[], now: number) {
    this.admins = new Set(adminEmails.map((email) => email.toLowerCase()));
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 1) {
      this.db.close();
      throw new Error('Banco de dados requer uma versão mais recente do servidor.');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS password_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS password_tokens_user ON password_tokens(user_id);
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      );
    `);
    this.db.pragma('user_version = 1');
    this.provisionAdmins(now);
  }

  close(): void { if (this.db.open) this.db.close(); }
  healthy(): boolean { return Boolean(this.db.prepare('SELECT 1').get()); }
  isAdmin(email: string): boolean { return this.admins.has(email.toLowerCase()); }

  /** Administradores entram no banco sem senha; definem a senha pelo link do e-mail. */
  private provisionAdmins(now: number): void {
    const insert = this.db.prepare(`
      INSERT INTO users(id, name, email, password_hash, created_at)
      VALUES (?, ?, ?, NULL, ?) ON CONFLICT(email) DO NOTHING
    `);
    this.db.transaction(() => {
      for (const email of this.admins) insert.run(randomUUID(), email.split('@')[0], email, now);
    })();
  }

  private toUser(row: Pick<UserRow, 'id' | 'name' | 'email'>): User {
    return { id: row.id, name: row.name, email: row.email, admin: this.isAdmin(row.email) };
  }

  private byEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  private byId(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  /** Conta a tentativa antes de qualquer trabalho caro; persiste entre reinícios. */
  reserve(limits: Array<{ key: string; max: number }>, now: number): Failure | undefined {
    return this.db.transaction(() => {
      this.db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').run(now);
      this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
      this.db.prepare('DELETE FROM password_tokens WHERE expires_at <= ?').run(now);
      const read = this.db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?');
      for (const limit of limits) {
        const current = read.get(limit.key) as { count: number; reset_at: number } | undefined;
        if (current && current.count >= limit.max) {
          return {
            ok: false as const,
            status: 429,
            error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
            retryAfter: Math.max(1, Math.ceil((current.reset_at - now) / 1000)),
          };
        }
      }
      const increment = this.db.prepare(`
        INSERT INTO rate_limits(key, count, reset_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1
      `);
      for (const limit of limits) increment.run(limit.key, now + LIMIT_WINDOW);
      return undefined;
    }).immediate();
  }

  private createSession(userId: string, now: number): string {
    const token = newToken();
    this.db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash(token), userId, now + SESSION_TTL, now);
    return token;
  }

  async login(email: string, password: string, ip: string, now: number, previousToken?: string):
    Promise<{ ok: true; user: User; token: string } | Failure> {
    const blocked = this.reserve([
      { key: `login-email:${tokenHash(email)}`, max: LOGIN_EMAIL_LIMIT },
      { key: `login-ip:${tokenHash(ip)}`, max: LOGIN_IP_LIMIT },
    ], now);
    if (blocked) return blocked;
    const original = this.byEmail(email);
    // Conta inexistente também faz o scrypt: o tempo de resposta não revela quem existe.
    const matches = await verifyPassword(password, original?.password_hash ?? null);
    if (!matches || !original) return invalidCredentials();
    return this.db.transaction(() => {
      const current = this.byEmail(email);
      // Senha trocada enquanto o scrypt rodava não pode gerar sessão.
      if (!current || current.password_hash !== original.password_hash) return invalidCredentials();
      if (previousToken) this.logout(previousToken);
      this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, current.id);
      return { ok: true as const, user: this.toUser(current), token: this.createSession(current.id, now) };
    }).immediate();
  }

  currentUser(token: string | undefined, now: number): User | null {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT users.id, users.name, users.email, users.password_hash FROM users
      JOIN sessions ON sessions.user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash(token), now) as UserRow | undefined;
    if (!row || !isPasswordHash(row.password_hash)) return null;
    return this.toUser(row);
  }

  logout(token: string | undefined): void {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  listUsers(now: number): UserSummary[] {
    const rows = this.db.prepare(`
      SELECT users.*, (
        SELECT MAX(expires_at) FROM password_tokens
        WHERE password_tokens.user_id = users.id AND expires_at > ?
      ) AS pending
      FROM users ORDER BY users.created_at, users.email
    `).all(now) as Array<UserRow & { pending: number | null }>;
    return rows.map((row) => ({
      ...this.toUser(row),
      hasPassword: isPasswordHash(row.password_hash),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      pendingLinkExpiresAt: row.pending,
    }));
  }

  createUser(name: string, email: string, now: number): { ok: true; user: User } | Failure {
    return this.db.transaction(() => {
      if (this.byEmail(email)) return { ok: false as const, status: 409, error: 'Já existe um usuário com esse e-mail.' };
      const id = randomUUID();
      this.db.prepare('INSERT INTO users(id, name, email, password_hash, created_at) VALUES (?, ?, ?, NULL, ?)')
        .run(id, name, email, now);
      return { ok: true as const, user: this.toUser({ id, name, email }) };
    }).immediate();
  }

  deleteUser(id: string, actingUserId: string): { ok: true } | Failure {
    const user = this.byId(id);
    if (!user) return { ok: false, status: 404, error: 'Usuário não encontrado.' };
    if (id === actingUserId) return { ok: false, status: 400, error: 'Você não pode remover a própria conta.' };
    if (this.isAdmin(user.email)) {
      return { ok: false, status: 400, error: 'Administradores são definidos em ADMIN_EMAILS e não podem ser removidos aqui.' };
    }
    // Sessões e links pendentes saem junto (ON DELETE CASCADE).
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  }

  /** Gera um link de uso único. Um link novo invalida os anteriores da mesma conta. */
  issuePasswordToken(userId: string, now: number): { token: string; purpose: TokenPurpose; user: User } | null {
    return this.db.transaction(() => {
      const user = this.byId(userId);
      if (!user) return null;
      const purpose: TokenPurpose = isPasswordHash(user.password_hash) ? 'reset' : 'invite';
      const token = newToken();
      this.db.prepare('DELETE FROM password_tokens WHERE user_id = ?').run(userId);
      this.db.prepare('INSERT INTO password_tokens(token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(tokenHash(token), userId, purpose, now + (purpose === 'invite' ? INVITE_TTL : RESET_TTL), now);
      return { token, purpose, user: this.toUser(user) };
    }).immediate();
  }

  /** "Esqueci a senha": devolve o link só se a conta existir; a rota responde igual nos dois casos. */
  requestPasswordLink(email: string, ip: string, now: number):
    { ok: true; issued: { token: string; purpose: TokenPurpose; user: User } | null } | Failure {
    const blocked = this.reserve([
      { key: `reset-email:${tokenHash(email)}`, max: RESET_EMAIL_LIMIT },
      { key: `reset-ip:${tokenHash(ip)}`, max: RESET_IP_LIMIT },
    ], now);
    if (blocked) return blocked;
    const user = this.byEmail(email);
    return { ok: true, issued: user ? this.issuePasswordToken(user.id, now) : null };
  }

  checkPasswordToken(token: string, ip: string, now: number):
    { ok: true; email: string; name: string; purpose: TokenPurpose } | Failure {
    const blocked = this.reserve([{ key: `token-ip:${tokenHash(ip)}`, max: TOKEN_IP_LIMIT }], now);
    if (blocked) return blocked;
    const row = this.db.prepare(`
      SELECT users.email, users.name, password_tokens.purpose FROM password_tokens
      JOIN users ON users.id = password_tokens.user_id
      WHERE password_tokens.token_hash = ? AND password_tokens.expires_at > ?
    `).get(tokenHash(token), now) as { email: string; name: string; purpose: TokenPurpose } | undefined;
    return row ? { ok: true, ...row } : invalidLink();
  }

  /** Consome o link, grava a senha, derruba as sessões antigas e já abre uma nova. */
  async setPasswordWithToken(token: string, password: string, ip: string, now: number):
    Promise<{ ok: true; user: User; token: string } | Failure> {
    const blocked = this.reserve([{ key: `token-ip:${tokenHash(ip)}`, max: TOKEN_IP_LIMIT }], now);
    if (blocked) return blocked;
    const passwordHash = await hashPassword(password);
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT user_id FROM password_tokens WHERE token_hash = ? AND expires_at > ?')
        .get(tokenHash(token), now) as { user_id: string } | undefined;
      if (!row) return invalidLink();
      const user = this.byId(row.user_id);
      if (!user) return invalidLink();
      this.db.prepare('UPDATE users SET password_hash = ?, last_login_at = ? WHERE id = ?').run(passwordHash, now, user.id);
      this.db.prepare('DELETE FROM password_tokens WHERE user_id = ?').run(user.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      return { ok: true as const, user: this.toUser(user), token: this.createSession(user.id, now) };
    }).immediate();
  }
}
