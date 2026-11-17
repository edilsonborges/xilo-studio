import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';
import type { ServerConfig } from './config.js';
import type { Email, Mailer } from './mailer.js';
import { LOGIN_EMAIL_LIMIT } from './store.js';

const ORIGIN = 'http://localhost:5173';
const ADMIN = 'admin@example.com';
const PASSWORD = 'senha-de-teste-123';

function writeDist(dist: string): void {
  mkdirSync(join(dist, '.vite'), { recursive: true });
  mkdirSync(join(dist, 'assets'), { recursive: true });
  for (const page of ['index', 'login', 'admin']) writeFileSync(join(dist, `${page}.html`), `<p>${page}</p>`);
  writeFileSync(join(dist, 'favicon.svg'), '<svg />');
  for (const file of ['login.js', 'api.js', 'api.css', 'main.js', 'admin.js', 'sdk.js']) {
    writeFileSync(join(dist, 'assets', file), `/* ${file} */`);
  }
  writeFileSync(join(dist, '.vite', 'manifest.json'), JSON.stringify({
    'login.html': { file: 'assets/login.js', isEntry: true, imports: ['_api.js'] },
    'index.html': { file: 'assets/main.js', isEntry: true, imports: ['_api.js'] },
    'admin.html': { file: 'assets/admin.js', isEntry: true, imports: ['_api.js'] },
    '_api.js': { file: 'assets/api.js', css: ['assets/api.css'] },
    'sdk.mjs': { file: 'assets/sdk.js' },
  }));
}

function setup(t: TestContext, mailer: Mailer | null = null) {
  const dir = mkdtempSync(join(tmpdir(), 'xilo-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeDist(join(dir, 'dist'));
  const config: ServerConfig = {
    databasePath: join(dir, 'xilo.sqlite'),
    appOrigin: ORIGIN,
    port: 0,
    nodeEnv: 'production',
    resendFrom: 'Xilo <x@example.com>',
    distPath: join(dir, 'dist'),
    adminEmails: [ADMIN],
    trustCloudflareIp: false,
  };
  const sent: Email[] = [];
  const pending: Promise<void>[] = [];
  const app = createApp({
    config,
    mailer: mailer === null ? async (message) => { sent.push(message); } : mailer,
    onBackgroundTask: (task) => pending.push(task),
  });
  t.after(() => app.locals.close());
  const flush = () => Promise.all(pending.splice(0));
  return { app, sent, flush };
}

const tokenFrom = (message: Email | undefined): string => {
  const match = message?.text.match(/\/login#token=([A-Za-z0-9_-]{43})/);
  assert.ok(match, 'o e-mail deve conter o link de senha');
  return match[1];
};

async function adminAgent(app: ReturnType<typeof setup>['app'], sent: Email[], flush: () => Promise<unknown>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/password/forgot').set('Origin', ORIGIN).send({ email: ADMIN }).expect(202);
  await flush();
  const token = tokenFrom(sent.at(-1));
  await agent.post('/api/auth/password/set').set('Origin', ORIGIN).send({ token, password: PASSWORD }).expect(200);
  return agent;
}

test('sem sessão, só a tela de login e seus arquivos ficam acessíveis', async (t) => {
  const { app } = setup(t);
  await request(app).get('/').expect(302).expect('Location', '/login');
  await request(app).get('/admin').expect(302).expect('Location', '/login');
  const login = await request(app).get('/login').expect(200);
  assert.match(login.headers['content-security-policy'], /connect-src 'self' https:\/\/api\.openai\.com/);
  await request(app).get('/assets/login.js').expect(200);
  await request(app).get('/assets/api.css').expect(200);
  await request(app).get('/assets/main.js').expect(401);
  await request(app).get('/assets/sdk.js').expect(401);
  for (const path of ['/assets/../index.html', '/assets/%2e%2e/index.html', '/assets/..%2findex.html']) {
    const res = await request(app).get(path);
    assert.ok([400, 401, 403, 404].includes(res.status), `${path} deveria ser recusado (veio ${res.status})`);
  }
  await request(app).get('/index.html').expect(404);
  await request(app).get('/healthz').expect(200, 'ok\n');
});

test('admin cria a senha pelo link do e-mail e entra no app e no painel', async (t) => {
  const { app, sent, flush } = setup(t);
  // Admin provisionado sem senha não entra.
  await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: ADMIN, password: PASSWORD }).expect(401);
  const agent = await adminAgent(app, sent, flush);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, ADMIN);
  assert.match(sent[0].subject, /acesso/i);
  await agent.get('/').expect(200, '<p>index</p>');
  await agent.get('/admin').expect(200, '<p>admin</p>');
  await agent.get('/assets/main.js').expect(200);
  await agent.get('/login').expect(302).expect('Location', '/');
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.admin, true);
});

test('link de senha só funciona uma vez e exige senha de 8 caracteres', async (t) => {
  const { app, sent, flush } = setup(t);
  await request(app).post('/api/auth/password/forgot').set('Origin', ORIGIN).send({ email: ADMIN }).expect(202);
  await flush();
  const token = tokenFrom(sent[0]);
  const check = await request(app).post('/api/auth/password/check').set('Origin', ORIGIN).send({ token }).expect(200);
  assert.equal(check.body.email, ADMIN);
  await request(app).post('/api/auth/password/set').set('Origin', ORIGIN).send({ token, password: 'curta' }).expect(400);
  await request(app).post('/api/auth/password/set').set('Origin', ORIGIN).send({ token, password: PASSWORD }).expect(200);
  await request(app).post('/api/auth/password/set').set('Origin', ORIGIN).send({ token, password: PASSWORD }).expect(400);
  await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: ADMIN, password: PASSWORD }).expect(200);
});

test('"esqueci a senha" responde igual para e-mail desconhecido e não envia nada', async (t) => {
  const { app, sent, flush } = setup(t);
  await request(app).post('/api/auth/password/forgot').set('Origin', ORIGIN).send({ email: 'ninguem@example.com' }).expect(202, { ok: true });
  await flush();
  assert.equal(sent.length, 0);
});

test('convite: admin convida, pessoa cria senha, não acessa o painel e perde acesso ao ser removida', async (t) => {
  const { app, sent, flush } = setup(t);
  const admin = await adminAgent(app, sent, flush);

  const created = await admin.post('/api/admin/users').set('Origin', ORIGIN)
    .send({ name: 'Maria', email: 'Maria@Example.com' }).expect(201);
  assert.equal(created.body.emailSent, true);
  assert.equal(sent.at(-1)?.to, 'maria@example.com');
  assert.match(sent.at(-1)!.text, /Olá, Maria!/);
  await admin.post('/api/admin/users').set('Origin', ORIGIN).send({ name: 'Maria', email: 'maria@example.com' }).expect(409);

  const maria = request.agent(app);
  await maria.post('/api/auth/password/set').set('Origin', ORIGIN)
    .send({ token: tokenFrom(sent.at(-1)), password: PASSWORD }).expect(200);
  await maria.get('/').expect(200);
  await maria.get('/admin').expect(302).expect('Location', '/');
  await maria.get('/api/admin/users').expect(403);

  const list = await admin.get('/api/admin/users').expect(200);
  const entry = list.body.users.find((user: { email: string }) => user.email === 'maria@example.com');
  assert.equal(entry.hasPassword, true);
  assert.equal(entry.admin, false);

  const adminEntry = list.body.users.find((user: { email: string }) => user.email === ADMIN);
  await admin.delete(`/api/admin/users/${adminEntry.id}`).set('Origin', ORIGIN).send({}).expect(400);

  await admin.delete(`/api/admin/users/${entry.id}`).set('Origin', ORIGIN).send({}).expect(200);
  await maria.get('/').expect(302).expect('Location', '/login');
  await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'maria@example.com', password: PASSWORD }).expect(401);
});

test('reenviar link invalida o anterior', async (t) => {
  const { app, sent, flush } = setup(t);
  const admin = await adminAgent(app, sent, flush);
  const created = await admin.post('/api/admin/users').set('Origin', ORIGIN).send({ name: 'Ana', email: 'ana@example.com' }).expect(201);
  const first = tokenFrom(sent.at(-1));
  await admin.post(`/api/admin/users/${created.body.user.id}/link`).set('Origin', ORIGIN).send({}).expect(200);
  const second = tokenFrom(sent.at(-1));
  assert.notEqual(first, second);
  await request(app).post('/api/auth/password/check').set('Origin', ORIGIN).send({ token: first }).expect(400);
  await request(app).post('/api/auth/password/check').set('Origin', ORIGIN).send({ token: second }).expect(200);
});

test('falha no Resend: usuário fica cadastrado e o painel avisa', async (t) => {
  let fail = false;
  const sent: Email[] = [];
  const { app, flush } = setup(t, async (message) => {
    if (fail) throw new Error('Resend fora');
    sent.push(message);
  });
  const admin = await adminAgent(app, sent, flush);
  fail = true;
  const created = await admin.post('/api/admin/users').set('Origin', ORIGIN).send({ name: 'Rui', email: 'rui@example.com' }).expect(201);
  assert.equal(created.body.emailSent, false);
  await admin.post(`/api/admin/users/${created.body.user.id}/link`).set('Origin', ORIGIN).send({}).expect(502);
});

test('mutações exigem a origem do app e JSON', async (t) => {
  const { app } = setup(t);
  await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: ADMIN, password: PASSWORD }).expect(403);
  await request(app).post('/api/auth/login').send({ email: ADMIN, password: PASSWORD }).expect(403);
  await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('Content-Type', 'text/plain').send('x').expect(415);
});

test('login bloqueia após muitas tentativas no mesmo e-mail', async (t) => {
  const { app } = setup(t);
  for (let i = 0; i < LOGIN_EMAIL_LIMIT; i++) {
    await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: ADMIN, password: 'errada-123' }).expect(401);
  }
  const blocked = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: ADMIN, password: 'errada-123' }).expect(429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
});

test('sem Resend configurado, "esqueci a senha" avisa que está indisponível', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'xilo-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeDist(join(dir, 'dist'));
  const app = createApp({
    config: {
      databasePath: join(dir, 'x.sqlite'), appOrigin: ORIGIN, port: 0, nodeEnv: 'production',
      resendFrom: 'x <x@example.com>', distPath: join(dir, 'dist'), adminEmails: [ADMIN], trustCloudflareIp: false,
    },
    mailer: null,
  });
  t.after(() => app.locals.close());
  await request(app).post('/api/auth/password/forgot').set('Origin', ORIGIN).send({ email: ADMIN }).expect(503);
  const me = await request(app).get('/api/auth/me').expect(200);
  assert.equal(me.body.emailEnabled, false);
});
