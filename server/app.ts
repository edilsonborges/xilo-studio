import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { z } from 'zod';
import { loadConfig, validateConfig, type ServerConfig } from './config.js';
import { createResendMailer, inviteEmail, resetEmail, type Mailer } from './mailer.js';
import { createGateway, type AiOutcome, type Gateway } from './ai.js';
import { VOICES, edgeNarrator, type Narrator } from './narration.js';
import { validPasswordInput } from './password.js';
import { type EventStatus, AuthStore, AI_IMAGE_LIMIT, AI_TEXT_LIMIT, NARRATION_LIMIT, SESSION_TTL, invalidCredentials, type TokenPurpose, type User } from './store.js';

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
const MAX_NARRATION_CHARS = 6_000;
/** O que o navegador pode registrar: o que só ele sabe (vídeo gerado, exportado, falhas). */
const clientEventSchema = z.object({
  kind: z.enum(['video_generated', 'video_exported', 'generation_failed', 'export_failed']),
  status: z.enum(['ok', 'fail']),
  detail: z.record(z.string(), z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()])).refine((d) => Object.keys(d).length <= 20),
}).strict();
const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.coerce.number().int().positive().optional(),
  kind: z.string().max(40).optional(),
  email: z.string().max(254).optional(),
});
const aiTextSchema = z.object({ system: z.string().min(1).max(20_000), prompt: z.string().min(1).max(60_000) }).strict();
const aiImageSchema = z.object({ prompt: z.string().trim().min(1).max(4_000) }).strict();
/** Consultas pendentes à IA ficam na memória; depois disso o pedido é dado como perdido. */
const AI_JOB_TTL = 15 * 60_000;
const narrationSchema = z.object({
  text: z.string().trim().min(1).max(MAX_NARRATION_CHARS),
  voice: z.enum(VOICES.map((voice) => voice.id) as [string, ...string[]]),
  rate: z.number().min(0.5).max(2),
}).strict();

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
  /** Gera a narração; os testes trocam pelo falso. */
  narrator?: Narrator;
  /** Cliente do opencode-gateway; null desliga a IA do servidor. */
  gateway?: Gateway | null;
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
  const smallJson = express.json({ limit: '4kb', strict: true, inflate: false });
  // O roteiro da narração pode ser longo; o resto da API recebe só alguns campos.
  const scriptJson = express.json({ limit: '64kb', strict: true, inflate: false });
  app.use('/api', (req, res, next) =>
    (req.path === '/narration' || req.path === '/ai/text' || req.path === '/events' ? scriptJson : smallJson)(req, res, next));

  /** Registro de atividade para o painel do administrador. */
  const audit = (who: { id?: string; email: string; name?: string } | null, kind: string, status: EventStatus, detail: Record<string, unknown> = {}): void =>
    store.logEvent(who, kind, status, detail, now());

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
      audit({ email: parsed.data.email }, 'login', 'fail', { motivo: result.status === 429 ? 'muitas tentativas' : 'e-mail ou senha inválidos' });
      failure(res, result);
      return;
    }
    audit(result.user, 'login', 'ok');
    startSession(res, result.token);
    res.json({ user: result.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    const leaving = store.currentUser(readToken(req), now());
    if (leaving) audit(leaving, 'logout', 'ok');
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
    audit(issued ? issued.user : { email: parsed.data.email }, 'password_link', issued ? 'ok' : 'info', { pedido: 'esqueci a senha', ...(issued ? {} : { observação: 'e-mail sem conta' }) });
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
    audit(result.user, 'password_set', 'ok');
    startSession(res, result.token);
    res.json({ user: result.user });
  });

  // ---- Narração com Edge TTS (qualquer pessoa logada) ----

  const narrator = options.narrator ?? edgeNarrator;

  function requireUser(req: Request, res: Response, next: NextFunction): void {
    const user = sessionUser(req, res);
    if (!user) {
      res.status(401).json({ error: 'Sua sessão expirou. Entre de novo.' });
      return;
    }
    res.locals.user = user;
    next();
  }

  app.get('/api/narration/voices', requireUser, (_req, res) => {
    res.json({ voices: VOICES, maxChars: MAX_NARRATION_CHARS });
  });

  app.post('/api/narration', requireUser, async (req, res) => {
    const parsed = narrationSchema.safeParse(req.body);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((issue) => issue.path[0] === 'text' && issue.code === 'too_big');
      res.status(400).json({
        error: tooLong ? `O roteiro passa de ${MAX_NARRATION_CHARS} caracteres.` : 'Confira o roteiro, a voz e a velocidade.',
      });
      return;
    }
    const user = res.locals.user as User;
    const blocked = store.reserve([{ key: `narration:${user.id}`, max: NARRATION_LIMIT }], now());
    if (blocked) {
      failure(res, blocked);
      return;
    }
    try {
      const { audio, words } = await narrator({
        text: parsed.data.text,
        voice: parsed.data.voice as (typeof VOICES)[number]['id'],
        rate: parsed.data.rate,
      });
      audit(user, 'narration', 'ok', { voz: parsed.data.voice, velocidade: parsed.data.rate, caracteres: parsed.data.text.length, roteiro: parsed.data.text.slice(0, 1_500) });
      res.json({ audio: audio.toString('base64'), mimeType: 'audio/mpeg', words });
    } catch (error) {
      audit(user, 'narration', 'fail', { voz: parsed.data.voice, erro: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido' });
      console.error(`Falha no Edge TTS: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      res.status(502).json({ error: 'O Edge TTS não respondeu. Tente de novo em instantes ou envie um áudio seu.' });
    }
  });

  // ---- IA pelo opencode-gateway (qualquer pessoa logada) ----

  const gateway = options.gateway === undefined
    ? (config.gateway ? createGateway(config.gateway) : null)
    : options.gateway;
  const aiJobs = new Map<string, { userId: string; statusUrl: string; kind: 'text' | 'image'; createdAt: number }>();

  function sendOutcome(res: Response, userId: string, outcome: AiOutcome): void {
    if (outcome.status === 'pending') {
      for (const [id, job] of aiJobs) if (now() - job.createdAt > AI_JOB_TTL) aiJobs.delete(id);
      const id = crypto.randomUUID();
      aiJobs.set(id, { userId, statusUrl: outcome.statusUrl, kind: outcome.kind, createdAt: now() });
      res.status(202).set('Retry-After', '5').json({ status: 'pending', id });
      return;
    }
    if (outcome.kind === 'text') res.json({ status: 'completed', text: outcome.text });
    else res.json({ status: 'completed', image: outcome.image, mimeType: outcome.mimeType });
  }

  function aiFailure(res: Response, error: unknown): void {
    console.error(`Falha no gateway de IA: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    res.status(502).json({ error: 'A IA não respondeu agora. Tente de novo em instantes.' });
  }

  app.get('/api/ai/status', requireUser, (_req, res) => {
    res.json({ text: Boolean(gateway), images: Boolean(gateway) });
  });

  app.post('/api/ai/text', requireUser, async (req, res) => {
    if (!gateway) {
      res.status(503).json({ error: 'A IA do servidor não está configurada.' });
      return;
    }
    const parsed = aiTextSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Pedido de texto inválido.' });
      return;
    }
    const user = res.locals.user as User;
    const blocked = store.reserve([{ key: `ai-text:${user.id}`, max: AI_TEXT_LIMIT }], now());
    if (blocked) {
      failure(res, blocked);
      return;
    }
    try {
      sendOutcome(res, user.id, await gateway.startText(parsed.data.system, parsed.data.prompt));
      audit(user, 'ai_text', 'ok', { tamanho: parsed.data.prompt.length });
    } catch (error) {
      audit(user, 'ai_text', 'fail', { erro: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido' });
      aiFailure(res, error);
    }
  });

  app.post('/api/ai/image', requireUser, async (req, res) => {
    if (!gateway) {
      res.status(503).json({ error: 'A IA do servidor não está configurada.' });
      return;
    }
    const parsed = aiImageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Descrição da imagem inválida.' });
      return;
    }
    const user = res.locals.user as User;
    const blocked = store.reserve([{ key: `ai-image:${user.id}`, max: AI_IMAGE_LIMIT }], now());
    if (blocked) {
      failure(res, blocked);
      return;
    }
    try {
      const outcome = await gateway.startImage(parsed.data.prompt);
      sendOutcome(res, user.id, outcome);
      // pedido pendente só conta quando a consulta concluir
      if (outcome.status === 'completed') audit(user, 'ai_image', 'ok', { descrição: parsed.data.prompt.slice(0, 600) });
    } catch (error) {
      audit(user, 'ai_image', 'fail', { descrição: parsed.data.prompt.slice(0, 600), erro: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido' });
      aiFailure(res, error);
    }
  });

  app.get('/api/ai/jobs/:id', requireUser, async (req, res) => {
    const user = res.locals.user as User;
    const job = aiJobs.get(String(req.params.id));
    if (!gateway || !job || job.userId !== user.id) {
      res.status(404).json({ error: 'Pedido não encontrado. Gere de novo.' });
      return;
    }
    try {
      const outcome = await gateway.poll(job.statusUrl, job.kind);
      if (outcome.status === 'pending') {
        res.status(202).set('Retry-After', '5').json({ status: 'pending', id: req.params.id });
        return;
      }
      aiJobs.delete(String(req.params.id));
      sendOutcome(res, user.id, outcome);
      if (job.kind === 'image') audit(user, 'ai_image', 'ok', { espera: `${Math.round((now() - job.createdAt) / 1000)} s` });
    } catch (error) {
      aiJobs.delete(String(req.params.id));
      audit(user, job.kind === 'image' ? 'ai_image' : 'ai_text', 'fail', { erro: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido' });
      aiFailure(res, error);
    }
  });

  // O navegador registra o que só ele sabe: vídeo gerado, exportado e falhas.
  app.post('/api/events', requireUser, (req, res) => {
    const parsed = clientEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Registro inválido.' });
      return;
    }
    const user = res.locals.user as User;
    const blocked = store.reserve([{ key: `events:${user.id}`, max: 300 }], now());
    if (blocked) {
      failure(res, blocked);
      return;
    }
    audit(user, parsed.data.kind, parsed.data.status, parsed.data.detail);
    res.status(201).json({ ok: true });
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

  app.get('/api/admin/events', (req, res) => {
    const parsed = eventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Filtro inválido.' });
      return;
    }
    const { limit, before, kind, email } = parsed.data;
    res.json({ events: store.listEvents({ limit, before, kind: kind || undefined, email: email || undefined }), summary: before ? undefined : store.activitySummary() });
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
    const emailSent = await sendLink(result.user.id);
    audit(res.locals.user as User, 'user_invited', emailSent ? 'ok' : 'fail', { convidado: result.user.email, nome: result.user.name, ...(emailSent ? {} : { erro: 'e-mail não enviado' }) });
    res.status(201).json({ user: result.user, emailSent });
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
    const removed = store.listUsers(now()).find((u) => u.id === id.data);
    const result = store.deleteUser(id.data, (res.locals.user as User).id);
    if (!result.ok) {
      failure(res, result);
      return;
    }
    audit(res.locals.user as User, 'user_removed', 'ok', { removido: removed?.email ?? id.data });
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

    // Ícone e imagem de prévia (WhatsApp, redes): públicos, sem login.
    for (const file of ['favicon.svg', 'og.jpg']) {
      app.get(`/${file}`, (_req, res, next) => {
        res.sendFile(join(config.distPath, file), { maxAge: '1d' }, (error) => { if (error) next(error); });
      });
    }

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
