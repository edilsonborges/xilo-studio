import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';
import type { ServerConfig } from './config.js';
import type { Email, Mailer } from './mailer.js';
import { createGateway, type Gateway } from './ai.js';
import type { Narrator } from './narration.js';
import { LOGIN_EMAIL_LIMIT, NARRATION_LIMIT } from './store.js';

const ORIGIN = 'http://localhost:5173';
const ADMIN = 'admin@example.com';
const PASSWORD = 'senha-de-teste-123';

function writeDist(dist: string): void {
  mkdirSync(join(dist, '.vite'), { recursive: true });
  mkdirSync(join(dist, 'assets'), { recursive: true });
  for (const page of ['index', 'login', 'admin']) writeFileSync(join(dist, `${page}.html`), `<p>${page}</p>`);
  writeFileSync(join(dist, 'favicon.svg'), '<svg />');
  writeFileSync(join(dist, 'og.jpg'), 'jpeg');
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

function setup(t: TestContext, mailer: Mailer | null = null, narrator?: Narrator, gateway?: Gateway | null) {
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
    narrator,
    gateway,
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
  // a prévia de link (WhatsApp) precisa da imagem sem login
  await request(app).get('/og.jpg').expect(200);
  await request(app).get('/favicon.svg').expect(200);
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

test('narração: só para quem está logado, devolve o mp3 e o tempo de cada palavra', async (t) => {
  const calls: unknown[] = [];
  const { app, sent, flush } = setup(t, null, async (request) => {
    calls.push(request);
    return { audio: Buffer.from('mp3-falso'), words: [{ word: 'Olá', start: 0.1, end: 0.4 }] };
  });
  const body = { text: 'Olá, sertão.', voice: 'pt-BR-FranciscaNeural', rate: 1.1 };
  await request(app).get('/api/narration/voices').expect(401);
  await request(app).post('/api/narration').set('Origin', ORIGIN).send(body).expect(401);

  const agent = await adminAgent(app, sent, flush);
  const voices = await agent.get('/api/narration/voices').expect(200);
  assert.ok(voices.body.voices.some((voice: { id: string }) => voice.id === 'pt-BR-AntonioNeural'));

  const result = await agent.post('/api/narration').set('Origin', ORIGIN).send(body).expect(200);
  assert.equal(Buffer.from(result.body.audio, 'base64').toString(), 'mp3-falso');
  assert.equal(result.body.mimeType, 'audio/mpeg');
  assert.deepEqual(result.body.words, [{ word: 'Olá', start: 0.1, end: 0.4 }]);
  assert.deepEqual(calls, [body]);

  // Roteiro longo passa do limite de 4 KiB das outras rotas, mas não do da narração.
  await agent.post('/api/narration').set('Origin', ORIGIN).send({ ...body, text: 'a'.repeat(5_000) }).expect(200);
  await agent.post('/api/narration').set('Origin', ORIGIN).send({ ...body, text: 'a'.repeat(6_001) }).expect(400);
  await agent.post('/api/narration').set('Origin', ORIGIN).send({ ...body, voice: 'en-US-GuyNeural' }).expect(400);
  await agent.post('/api/narration').set('Origin', ORIGIN).send({ ...body, rate: 5 }).expect(400);
  await agent.post('/api/narration').set('Origin', 'https://evil.example').send(body).expect(403);
});

test('narração: falha do Edge TTS vira 502 e há limite por pessoa', async (t) => {
  let fail = true;
  const { app, sent, flush } = setup(t, null, async () => {
    if (fail) throw new Error('fora do ar');
    return { audio: Buffer.from('x'), words: [] };
  });
  const agent = await adminAgent(app, sent, flush);
  const body = { text: 'Teste.', voice: 'pt-BR-AntonioNeural', rate: 1 };
  const failed = await agent.post('/api/narration').set('Origin', ORIGIN).send(body).expect(502);
  assert.match(failed.body.error, /Edge TTS/);
  fail = false;
  for (let i = 1; i < NARRATION_LIMIT; i++) await agent.post('/api/narration').set('Origin', ORIGIN).send(body).expect(200);
  await agent.post('/api/narration').set('Origin', ORIGIN).send(body).expect(429);
});

test('IA: sem gateway configurado, o app avisa e não chama nada', async (t) => {
  const { app, sent, flush } = setup(t);
  const agent = await adminAgent(app, sent, flush);
  const status = await agent.get('/api/ai/status').expect(200);
  assert.deepEqual(status.body, { text: false, images: false });
  await agent.post('/api/ai/text').set('Origin', ORIGIN).send({ system: 's', prompt: 'p' }).expect(503);
});

test('IA: texto na hora, imagem pendente consultada até concluir, só pelo dono', async (t) => {
  const polls: string[] = [];
  let ready = false;
  const gateway: Gateway = {
    startText: async (system, prompt) => ({ status: 'completed', kind: 'text', text: `{"ok":"${system}/${prompt}"}` }),
    startImage: async () => ({ status: 'pending', kind: 'image', statusUrl: '/v1/images/generations/abc' }),
    poll: async (statusUrl, kind) => {
      polls.push(`${kind}:${statusUrl}`);
      return ready
        ? { status: 'completed', kind: 'image', image: 'iVBOR'.padEnd(200, 'A'), mimeType: 'image/png' }
        : { status: 'pending', kind, statusUrl };
    },
  };
  const { app, sent, flush } = setup(t, null, undefined, gateway);
  await request(app).get('/api/ai/status').expect(401);
  const admin = await adminAgent(app, sent, flush);
  assert.deepEqual((await admin.get('/api/ai/status').expect(200)).body, { text: true, images: true });

  const text = await admin.post('/api/ai/text').set('Origin', ORIGIN).send({ system: 'sys', prompt: 'roteiro' }).expect(200);
  assert.deepEqual(text.body, { status: 'completed', text: '{"ok":"sys/roteiro"}' });
  // roteiro grande passa do limite de 4 KiB das outras rotas
  await admin.post('/api/ai/text').set('Origin', ORIGIN).send({ system: 'sys', prompt: 'x'.repeat(20_000) }).expect(200);

  const started = await admin.post('/api/ai/image').set('Origin', ORIGIN).send({ prompt: 'um menino brincando' }).expect(202);
  assert.equal(started.body.status, 'pending');
  const id = started.body.id;

  // outra pessoa não consulta o pedido de quem pediu
  const other = await admin.post('/api/admin/users').set('Origin', ORIGIN).send({ name: 'Bia', email: 'bia@example.com' }).expect(201);
  assert.ok(other.body.user.id);
  const bia = request.agent(app);
  await bia.post('/api/auth/password/set').set('Origin', ORIGIN).send({ token: tokenFrom(sent.at(-1)), password: PASSWORD }).expect(200);
  await bia.get(`/api/ai/jobs/${id}`).expect(404);

  await admin.get(`/api/ai/jobs/${id}`).expect(202);
  ready = true;
  const done = await admin.get(`/api/ai/jobs/${id}`).expect(200);
  assert.equal(done.body.status, 'completed');
  assert.equal(done.body.mimeType, 'image/png');
  await admin.get(`/api/ai/jobs/${id}`).expect(404);
  assert.deepEqual(polls, ['image:/v1/images/generations/abc', 'image:/v1/images/generations/abc']);
});

test('IA: falha do gateway vira 502 sem reenvio', async (t) => {
  let calls = 0;
  const gateway: Gateway = {
    startText: async () => { calls++; throw new Error('image_generation_failed'); },
    startImage: async () => { calls++; throw new Error('image_generation_failed'); },
    poll: async () => { throw new Error('nunca'); },
  };
  const { app, sent, flush } = setup(t, null, undefined, gateway);
  const admin = await adminAgent(app, sent, flush);
  await admin.post('/api/ai/image').set('Origin', ORIGIN).send({ prompt: 'x' }).expect(502);
  assert.equal(calls, 1);
});

test('cliente do gateway: 202, consulta, extração e URL de consulta só do próprio gateway', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const replies: Response[] = [];
  const fake = (async (url: URL | string, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return replies.shift()!;
  }) as typeof fetch;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const gw = createGateway({ url: 'http://gw.test:4097', apiKey: 'k', textModel: 'gpt-6-luna', imageModel: 'gpt-image-2' }, fake);

  replies.push(json(200, { choices: [{ message: { content: '{"a":1}' } }] }));
  assert.deepEqual(await gw.startText('s', 'p'), { status: 'completed', kind: 'text', text: '{"a":1}' });
  const sentBody = JSON.parse(String(requests[0].init?.body));
  assert.equal(sentBody.model, 'gpt-6-luna');
  assert.equal(sentBody.reasoning_effort, 'low');
  const sentHeaders = requests[0].init?.headers as Record<string, string>;
  assert.equal(sentHeaders.Authorization, 'Bearer k');
  assert.equal(sentHeaders['X-Executor-Profile'], 'minimal');
  assert.match(sentHeaders.Prefer, /respond-async/);

  replies.push(json(202, { id: 'g1', status_url: '/v1/images/generations/g1' }));
  const pending = await gw.startImage('menino');
  assert.deepEqual(pending, { status: 'pending', kind: 'image', statusUrl: '/v1/images/generations/g1' });

  replies.push(json(200, { status: 'running' }));
  assert.equal((await gw.poll('/v1/images/generations/g1', 'image')).status, 'pending');
  replies.push(json(200, { status: 'completed', result: { data: [{ b64_json: 'A'.repeat(200) }] } }));
  const done = await gw.poll('/v1/images/generations/g1', 'image');
  assert.equal(done.status === 'completed' && done.kind === 'image' && done.image.length, 200);

  replies.push(json(200, { status: 'failed', error: { message: 'image_generation_failed' } }));
  await assert.rejects(gw.poll('/v1/images/generations/g1', 'image'), /failed.*image_generation_failed/);

  replies.push(json(202, { id: 'x', status_url: 'https://evil.example/steal' }));
  await assert.rejects(gw.startImage('menino'), /fora do gateway/);

  replies.push(json(502, { error: { message: 'image_generation_failed' } }));
  await assert.rejects(gw.startImage('menino'), /502: image_generation_failed/);
});

test('atividade: só o admin vê; registra login, narração, vídeo e convite; filtra e resume', async (t) => {
  const { app, sent, flush } = setup(t, null, async () => ({ audio: Buffer.from('x'), words: [] }));
  await request(app).get('/api/admin/events').expect(401);
  await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: ADMIN, password: 'senha-errada-1' }).expect(401);
  const admin = await adminAgent(app, sent, flush);
  await admin.post('/api/narration').set('Origin', ORIGIN).send({ text: 'Era uma vez.', voice: 'pt-BR-AntonioNeural', rate: 1 }).expect(200);
  await admin.post('/api/events').set('Origin', ORIGIN)
    .send({ kind: 'video_generated', status: 'ok', detail: { roteiro: 'Era uma vez.', cenas: 2, estilo: 'Noir' } }).expect(201);
  await admin.post('/api/events').set('Origin', ORIGIN).send({ kind: 'apagar_tudo', status: 'ok', detail: {} }).expect(400);
  await request(app).post('/api/events').set('Origin', ORIGIN).send({ kind: 'video_generated', status: 'ok', detail: {} }).expect(401);

  await admin.post('/api/admin/users').set('Origin', ORIGIN).send({ name: 'Lia', email: 'lia@example.com' }).expect(201);
  const lia = request.agent(app);
  await lia.post('/api/auth/password/set').set('Origin', ORIGIN).send({ token: tokenFrom(sent.at(-1)), password: PASSWORD }).expect(200);
  await lia.get('/api/admin/events').expect(403);

  const all = await admin.get('/api/admin/events').expect(200);
  const kinds = all.body.events.map((e: { kind: string; status: string }) => `${e.kind}:${e.status}`);
  for (const expected of ['login:fail', 'password_link:ok', 'password_set:ok', 'narration:ok', 'video_generated:ok', 'user_invited:ok']) {
    assert.ok(kinds.includes(expected), `${expected} em ${kinds.join(', ')}`);
  }
  const video = all.body.events.find((e: { kind: string }) => e.kind === 'video_generated');
  assert.deepEqual(video.detail, { roteiro: 'Era uma vez.', cenas: 2, estilo: 'Noir' });
  assert.equal(video.email, ADMIN);
  // nunca guarda senha nem token
  assert.doesNotMatch(JSON.stringify(all.body), new RegExp(`${PASSWORD}|senha-errada-1|token=`));

  const onlyVideos = await admin.get('/api/admin/events?kind=video_generated').expect(200);
  assert.equal(onlyVideos.body.events.length, 1);
  const mine = all.body.summary.find((s: { email: string }) => s.email === ADMIN);
  assert.equal(mine.videos, 1);
  assert.equal(mine.narrations, 1);
  assert.ok(mine.failures >= 1);
  const page = await admin.get(`/api/admin/events?limit=2`).expect(200);
  const next = await admin.get(`/api/admin/events?limit=2&before=${page.body.events[1].id}`).expect(200);
  assert.ok(next.body.events[0].id < page.body.events[1].id);
  assert.equal(next.body.summary, undefined);
});

test('VoiceStudio é a primeira voz e entrega WAV por consulta autenticada', async t => {
  const { app, sent, flush } = setup(t, null, async () => ({
    audio: Buffer.from('wav-falso'), words: [], mimeType: 'audio/wav',
  }));
  const agent = await adminAgent(app, sent, flush);
  const list = await agent.get('/api/narration/voices').expect(200);
  const voice = list.body.voices[0].id;
  assert.equal(voice, 'voicestudio-pt-br');
  const result = await agent.post('/api/narration').set('Origin', ORIGIN)
    .send({ text: 'Olá, Brasil!', rate: 1 }).expect(202);
  const path = `/api/narration/jobs/${result.body.jobId}`;
  await request(app).get(path).expect(401);
  const done = await agent.get(path).expect(200);
  assert.equal(done.body.mimeType, 'audio/wav');
  assert.deepEqual(done.body.words, []);
  assert.equal(Buffer.from(done.body.audio, 'base64').toString(), 'wav-falso');
});
