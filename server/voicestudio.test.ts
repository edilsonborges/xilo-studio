import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceStudio, VOICESTUDIO_ID } from './voicestudio.js';

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
