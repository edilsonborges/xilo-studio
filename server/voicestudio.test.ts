import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceStudio, VOICESTUDIO_ID } from './voicestudio.js';
import { createOmniVoice, createStudioProbe, patientFetch } from './voicestudio.js';
import { createServer } from 'node:http';

test('VoiceStudio divide o roteiro no limite da API e reúne PCM em um único WAV', async () => {
  const parts: string[] = [];
  const generate = createVoiceStudio({ url: 'http://localhost:3900', key: 'teste' }, async (url, init) => {
    assert.equal(String(url), 'http://localhost:3900/v1/audio/speech');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer teste');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.language, 'pt-BR');
    assert.equal(payload.speed, 1.1);
    assert.ok([...payload.input].length <= 240);
    parts.push(payload.input);
    return new Response(new Uint8Array([parts.length, 0]), { headers: { 'content-type': 'audio/pcm' } });
  });
  const text = 'Coração do sertão. '.repeat(300).trim();
  const { audio, mimeType } = await generate({ text, rate: 1.1, voice: VOICESTUDIO_ID });
  assert.equal(parts.join(' '), text);
  assert.equal(mimeType, 'audio/wav');
  assert.equal(audio.readUInt32LE(24), 24000);
  assert.ok(parts.length > 2);
  assert.equal(audio.readUInt32LE(40), parts.length * 2);
  assert.deepEqual([...audio.subarray(44)], parts.flatMap((_, index) => [index + 1, 0]));
});

test('estilos de narração selecionam timbre e combinam o ritmo com a velocidade escolhida', async () => {
  const calls: Array<[string, number]> = [];
  const speak = createVoiceStudio({ url: 'http://localhost:3900' }, async (_url, init) => {
    const { voice, speed } = JSON.parse(String(init?.body));
    calls.push([voice, speed]);
    return new Response(new Uint8Array(2), { headers: { 'content-type': 'audio/pcm' } });
  });
  for (const voice of ['voicestudio-pt-br', 'voicestudio-noticia', 'voicestudio-conto', 'voicestudio-documentario'] as const) {
    await speak({ text: 'Chove na cidade.', voice, rate: 0.9 });
  }
  assert.deepEqual(calls, [['pf_dora', 0.9], ['pm_alex', 0.9 * 1.06], ['pm_santa', 0.9 * 0.92], ['pf_dora,pm_alex', 0.9 * 0.96]]);
});

test('sonda do VoiceStudio: fora do ar, só com OmniVoice, com Kokoro; guarda por um minuto', async () => {
  let calls = 0;
  let reply: (() => Response) | null = null;
  let clock = 0;
  let profiles: string[] | null = null;
  const probe = createStudioProbe({ url: 'http://127.0.0.1:3900', key: 'chave' }, (async (url: URL | string, init?: RequestInit) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer chave');
    if (String(url) === 'http://127.0.0.1:3900/profiles') {
      if (!profiles) throw new Error('ECONNRESET');
      return new Response(JSON.stringify(profiles.map((name) => ({ id: 'x', name }))), { headers: { 'content-type': 'application/json' } });
    }
    calls++;
    assert.equal(String(url), 'http://127.0.0.1:3900/engines/tts');
    if (!reply) throw new Error('ECONNREFUSED');
    return reply();
  }) as typeof fetch, () => clock);
  const engines = (mlx: boolean) => () => new Response(JSON.stringify({ active: 'omnivoice', backends: [{ id: 'omnivoice', available: true }, { id: 'mlx-audio', available: mlx }] }), { headers: { 'content-type': 'application/json' } });

  assert.deepEqual(await probe(), { up: false, kokoro: false });
  assert.deepEqual(await probe(), { up: false, kokoro: false });
  assert.equal(calls, 1, 'dentro de um minuto não sonda de novo');
  reply = engines(false);
  clock = 61_000;
  // sem Kokoro, os estilos vêm dos perfis de voz; falha na lista vale como nenhum
  assert.deepEqual(await probe(), { up: true, kokoro: false, clones: [] });
  profiles = ['Demo Voice', 'Xilo Conto', 'Xilo Notícia', 'Xilo Natural'];
  clock = 121_500;
  assert.deepEqual(await probe(), { up: true, kokoro: false, clones: ['voicestudio-pt-br', 'voicestudio-conto'] });
  reply = engines(true);
  clock = 182_000;
  assert.deepEqual(await probe(), { up: true, kokoro: true });
  // respondeu sem a lista de motores: trata como a instalação antiga, com Kokoro
  reply = () => new Response('not found', { status: 404 });
  clock = 243_000;
  assert.deepEqual(await probe(), { up: true, kokoro: true });
});

test('OmniVoice: um pedido em streaming, passos pela qualidade e andamento pelos bytes recebidos', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const pcm = (seconds: number) => new Uint8Array(48_000 * seconds);
  const speak = createOmniVoice({ url: 'http://localhost:3900', key: 'chave' }, (async (_url: URL | string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(pcm(2)); controller.enqueue(pcm(3)); controller.close(); } });
    return new Response(stream, { headers: { 'content-type': 'audio/pcm' } });
  }) as typeof fetch);
  const progress: number[] = [];
  const result = await speak({ text: 'O sol queimava a caatinga.', voice: 'voicestudio-omnivoice', rate: 1.1, quality: 'best', onProgress: (s) => progress.push(s) });
  assert.equal(bodies.length, 1);
  assert.deepEqual({ model: bodies[0].model, steps: bodies[0].num_step, format: bodies[0].response_format, stream: bodies[0].stream_format, language: bodies[0].language, speed: bodies[0].speed, seed: bodies[0].seed },
    { model: 'omnivoice', steps: 16, format: 'pcm', stream: 'audio', language: 'pt-BR', speed: 1.1, seed: undefined });
  assert.deepEqual(progress, [2, 5]);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.audio.length, 44 + 48_000 * 5);
  // qualidade rápida é o padrão
  await speak({ text: 'Outra frase.', voice: 'voicestudio-omnivoice', rate: 1 });
  assert.equal(bodies[1].num_step, 8);
  assert.equal('voice' in bodies[1], false, 'a voz padrão do motor não leva perfil');
  // estilo clonado: vai o nome do perfil de voz
  await speak({ text: 'Era uma vez.', voice: 'voicestudio-conto', rate: 1 });
  assert.equal(bodies[2].voice, 'Xilo Conto');
  // resposta que não é áudio vira erro
  const broken = createOmniVoice({ url: 'http://localhost:3900' }, (async () => new Response('{"error":"x"}', { status: 503, headers: { 'content-type': 'application/json' } })) as typeof fetch);
  await assert.rejects(broken({ text: 'x', voice: 'voicestudio-omnivoice', rate: 1 }), /HTTP 503/);
});

test('pedido ao OmniVoice pela rede: corpo, cabeçalhos, áudio em pedaços e cancelamento', async (t) => {
  const seen: Array<{ auth?: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (piece) => { body += piece; });
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body });
      if (req.url === '/lento') return; // nunca responde
      if (req.url === '/erro') { res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"x"}'); return; }
      res.writeHead(200, { 'content-type': 'audio/pcm' });
      res.write(Buffer.alloc(48_000));
      setTimeout(() => res.end(Buffer.alloc(96_000)), 30);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address() as { port: number };
  const progress: number[] = [];
  const speak = createOmniVoice({ url: `http://127.0.0.1:${port}`, key: 'chave' });
  const result = await speak({ text: 'Era uma vez.', voice: 'voicestudio-conto', rate: 1, onProgress: (s) => progress.push(s) });
  assert.equal(result.audio.length, 44 + 144_000);
  assert.equal(progress.at(-1), 3);
  assert.equal(seen[0].auth, 'Bearer chave');
  assert.equal(JSON.parse(seen[0].body).voice, 'Xilo Conto');
  assert.equal((await patientFetch(`http://127.0.0.1:${port}/erro`, { method: 'POST', body: '{}' })).status, 500);
  await assert.rejects(patientFetch(`http://127.0.0.1:${port}/lento`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(100) }));
});
