import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { z } from 'zod';
import { loadConfig, validateConfig, type ServerConfig } from './config.js';
import { createResendMailer, inviteEmail, resetEmail, type Mailer } from './mailer.js';
import { validPasswordInput } from './password.js';
import { AuthStore, SESSION_TTL, invalidCredentials, type TokenPurpose, type User } from './store.js';

// Mesma política que o nginx usava: o app só conversa com o próprio site e com as
// APIs de IA, porque as chaves do usuário ficam no localStorage.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const MIN_PASSWORD = 8;
const emailSchema = z.string().trim().toLowerCase().max(254).email();
const linkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const newPasswordSchema = z.string()
  .refine((value) => [...value].length >= MIN_PASSWORD, `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`)
  .refine(validPasswordInput, 'Senha inválida.');
const loginSchema = z.object({ email: emailSchema, password: z.string().refine(validPasswordInput) }).strict();
const forgotSchema = z.object({ email: emailSchema }).strict();
const checkTokenSchema = z.object({ token: linkTokenSchema }).strict();
const setPasswordSchema = z.object({ token: linkTokenSchema, password: newPasswordSchema }).strict();
const createUserSchema = z.object({ name: z.string().trim().min(1).max(80), email: emailSchema }).strict();
const userIdSchema = z.string().uuid();

/** Arquivos que a tela de login precisa: os únicos liberados sem sessão. */
function loginShellFiles(distPath: string): Set<string> {
  const schema = z.record(z.string(), z.object({
    file: z.string(),
    isEntry: z.boolean().optional(),
    imports: z.array(z.string()).optional(),
    css: z.array(z.string()).optional(),
    assets: z.array(z.string()).optional(),
  }));
  try {
    const manifest = schema.parse(JSON.parse(readFileSync(join(distPath, '.vite', 'manifest.json'), 'utf8')));
    if (!manifest['login.html']?.isEntry || !manifest['index.html']?.isEntry || !manifest['admin.html']?.isEntry) {
      throw new Error('Entradas ausentes.');
    }
    const files = new Set<string>();
    const visited = new Set<string>();
    const visit = (key: string): void => {
      if (visited.has(key)) return;
      visited.add(key);
      const chunk = manifest[key];
      if (!chunk) throw new Error('Dependência ausente.');
      for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) files.add(`/${posix.normalize(file)}`);
      for (const dependency of chunk.imports ?? []) visit(dependency);
    };
    visit('login.html');
    return files;
  } catch {
    throw new Error('Build de produção sem manifesto Vite válido. Rode npm run build.');
  }
}

export interface AppOptions {
  config?: ServerConfig;
  now?: () => number;
  mailer?: Mailer | null;
  /** Envio em segundo plano ("esqueci a senha"); os testes aguardam por aqui. */
  onBackgroundTask?: (task: Promise<void>) => void;
}

export function createApp(options: AppOptions = {}): express.Express {
  const config = options.config ?? loadConfig();
  validateConfig(config);
  const production = config.nodeEnv === 'production';
  const publicAssets = production ? loginShellFiles(config.distPath) : new Set<string>();
  const now = options.now ?? Date.now;
  const store = new AuthStore(config.databasePath, config.adminEmails, now());
  const mailer = options.mailer === undefined
    ? (config.resendApiKey ? createResendMailer(config.resendApiKey, config.resendFrom) : null)
    : options.mailer;
  const app = express();
  const secure = new URL(config.appOrigin).protocol === 'https:';
  const cookieName = secure ? '__Host-xilo_session' : 'xilo_session';
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.locals.close = () => store.close();

  const passwordLink = (token: string): string => `${config.appOrigin}/login#token=${token}`;

  function clientIp(req: Request): string {
    // A porta só escuta em 127.0.0.1: o que chega de fora vem pelo túnel, que preenche este cabeçalho.
    const forwarded = config.trustCloudflareIp ? req.get('cf-connecting-ip') : undefined;
    return forwarded && forwarded.length <= 64 ? forwarded : (req.ip ?? 'unknown');
  }

  function readToken(req: Request): string | undefined {
    const cookie = req.headers.cookie?.split(';').map((value) => value.trim())
      .find((value) => value.startsWith(`${cookieName}=`));
    const token = cookie?.slice(cookieName.length + 1);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }

  function sessionUser(req: Request, res: Response): User | null {
    const token = readToken(req);
    const user = store.currentUser(token, now());
    if (token && !user) res.clearCookie(cookieName, cookieOptions);
    return user;
  }

  function failure(res: Response, result: { status: number; error: string; retryAfter?: number }): void {
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    res.status(result.status).json({ error: result.error });
  }

  function startSession(res: Response, token: string): void {
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_TTL });
  }

  function messageFor(purpose: TokenPurpose, user: User, token: string, requestId: string) {
    return purpose === 'invite'
      ? inviteEmail(user.email, user.name, passwordLink(token), requestId)
      : resetEmail(user.email, passwordLink(token), requestId);
  }

  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  // Usado pelo scripts/update.sh e pelo healthcheck do Docker.
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('text/plain');
    if (store.healthy()) res.send('ok\n');
    else res.status(503).send('erro\n');
  });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') !== config.appOrigin || req.get('sec-fetch-site') === 'cross-site') {
        res.status(403).json({ error: 'Origem da solicitação não autorizada.' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'Envie os dados no formato JSON.' });
        return;
      }
    }
    next();
  });
  app.use('/api', express.json({ limit: '4kb', strict: true, inflate: false }));

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: sessionUser(req, res), emailEnabled: Boolean(mailer) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      failure(res, invalidCredentials());
      return;
    }
    const result = await store.login(parsed.data.email, parsed.data.password, clientIp(req), now(), readToken(req));
    if (!result.ok) {
      failure(res, result);
      return;
    }
    startSession(res, result.token);
    res.json({ user: result.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    store.logout(readToken(req));
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  });

  app.post('/api/auth/password/forgot', (req, res) => {
    if (!mailer) {
      res.status(503).json({ error: 'O envio de e-mail não está configurado. Fale com o administrador.' });
      return;
    }
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    const result = store.requestPasswordLink(parsed.data.email, clientIp(req), now());
    if (!result.ok) {
      failure(res, result);
      return;
    }
    // A resposta sai antes do envio e é igual para qualquer e-mail: não revela quem tem conta.
    res.status(202).json({ ok: true });
    const issued = result.issued;
    if (!issued) return;
    const task = mailer(messageFor(issued.purpose, issued.user, issued.token, crypto.randomUUID()))
      .catch((error: unknown) => {
        console.error(`Falha ao enviar link de senha: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      });
    options.onBackgroundTask?.(task);
  });

  app.post('/api/auth/password/check', (req, res) => {
    const parsed = checkTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Este link é inválido ou já expirou. Peça um novo.' });
      return;
    }
    const result = store.checkPasswordToken(parsed.data.token, clientIp(req), now());
    if (!result.ok) {
      failure(res, result);
      return;
    }
    res.json({ email: result.email, name: result.name, purpose: result.purpose });
  });

  app.post('/api/auth/password/set', async (req, res) => {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((item) => item.path[0] === 'password');
      res.status(400).json({ error: issue?.message ?? 'Este link é inválido ou já expirou. Peça um novo.' });
      return;
    }
    const result = await store.setPasswordWithToken(parsed.data.token, parsed.data.password, clientIp(req), now());
    if (!result.ok) {
      failure(res, result);
      return;
    }
    startSession(res, result.token);
    res.json({ user: result.user });
  });

  // ---- Painel de usuários (só administradores) ----

  function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = sessionUser(req, res);
    if (!user) {
      res.status(401).json({ error: 'Entre para continuar.' });
      return;
    }
    if (!user.admin) {
      res.status(403).json({ error: 'Só administradores podem gerenciar usuários.' });
      return;
    }
    res.locals.user = user;
    next();
  }

  app.use('/api/admin', requireAdmin);

  app.get('/api/admin/users', (_req, res) => {
    res.json({ users: store.listUsers(now()), emailEnabled: Boolean(mailer) });
  });

  async function sendLink(userId: string): Promise<boolean> {
    if (!mailer) return false;
    const issued = store.issuePasswordToken(userId, now());
    if (!issued) return false;
    try {
      await mailer(messageFor(issued.purpose, issued.user, issued.token, crypto.randomUUID()));
      return true;
    } catch (error) {
      console.error(`Falha ao enviar convite: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      return false;
    }
  }

  app.post('/api/admin/users', async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Confira o nome e o e-mail.' });
      return;
    }
    const result = store.createUser(parsed.data.name, parsed.data.email, now());
    if (!result.ok) {
      failure(res, result);
      return;
    }
    res.status(201).json({ user: result.user, emailSent: await sendLink(result.user.id) });
  });

  app.post('/api/admin/users/:id/link', async (req, res) => {
    const id = userIdSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    if (!mailer) {
      res.status(503).json({ error: 'O envio de e-mail não está configurado (RESEND_API_KEY).' });
      return;
    }
    if (!(await sendLink(id.data))) {
      res.status(502).json({ error: 'Não foi possível enviar o e-mail. Tente de novo em instantes.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    const id = userIdSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const result = store.deleteUser(id.data, (res.locals.user as User).id);
    if (!result.ok) {
      failure(res, result);
      return;
    }
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));

  // ---- Páginas e arquivos do build (só em produção; no dev quem serve é o Vite) ----

  if (production) {
    const page = (file: string) => (_req: Request, res: Response, next: NextFunction) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(config.distPath, file), (error) => { if (error) next(error); });
    };

    app.get('/login', (req, res, next) => {
      if (sessionUser(req, res)) {
        res.redirect(302, '/');
        return;
      }
      page('login.html')(req, res, next);
    });

    app.get('/', (req, res, next) => {
      if (!sessionUser(req, res)) {
        res.redirect(302, '/login');
        return;
      }
      page('index.html')(req, res, next);
    });

    app.get('/admin', (req, res, next) => {
      const user = sessionUser(req, res);
      if (!user) {
        res.redirect(302, '/login');
        return;
      }
      if (!user.admin) {
        res.redirect(302, '/');
        return;
      }
      page('admin.html')(req, res, next);
    });

    app.get('/favicon.svg', (_req, res, next) => {
      res.sendFile(join(config.distPath, 'favicon.svg'), { maxAge: '1d' }, (error) => { if (error) next(error); });
    });

    const assets = express.static(join(config.distPath, 'assets'), {
      index: false, dotfiles: 'deny', fallthrough: false, immutable: true, maxAge: '1y',
    });
    const privateAssets = express.static(join(config.distPath, 'assets'), {
      index: false, dotfiles: 'deny', fallthrough: false, cacheControl: false,
    });
    app.use('/assets', (req, res, next) => {
      const path = posix.normalize(`/assets${req.path}`);
      if (!publicAssets.has(path)) {
        // O código do app e do painel só sai para quem está logado.
        if (!sessionUser(req, res)) {
          res.status(401).type('text/plain').send('Entre para continuar.\n');
          return;
        }
        res.vary('Cookie');
        res.set('Cache-Control', 'private, max-age=31536000, immutable');
        privateAssets(req, res, next);
        return;
      }
      assets(req, res, next);
    });
  }

  app.use((_req, res) => res.status(404).type('text/plain').send('Não encontrado.\n'));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.type === 'entity.too.large') res.status(413).json({ error: 'A solicitação excede o tamanho permitido.' });
    else if (error.type === 'entity.parse.failed') res.status(400).json({ error: 'JSON inválido.' });
    else if (error.status === 404 || error.statusCode === 404) res.status(404).type('text/plain').send('Não encontrado.\n');
    else res.status(500).json({ error: 'Não foi possível concluir a solicitação.' });
  };
  app.use(errors);
  return app;
}
