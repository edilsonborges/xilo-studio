import type { Narrator } from './narration.js';

export const VOICESTUDIO_ID = 'voicestudio-pt-br';

export const STUDIO_STYLES = [
  { id: VOICESTUDIO_ID, label: 'VoiceStudio · Natural', preset: 'pf_dora', pace: 1 },
  { id: 'voicestudio-noticia', label: 'VoiceStudio · Notícia', preset: 'pm_alex', pace: 1.06 },
  { id: 'voicestudio-conto', label: 'VoiceStudio · Conto', preset: 'pm_santa', pace: 0.92 },
  { id: 'voicestudio-documentario', label: 'VoiceStudio · Documentário', preset: 'pf_dora,pm_alex', pace: 0.96 },
] as const;

export const studioStyle = (id: string) => STUDIO_STYLES.find(style => style.id === id);

export interface VoiceStudioConfig {
  url: string;
  key?: string;
  model?: string;
  voice?: string;
}

export function voiceStudioConfig(env: NodeJS.ProcessEnv = process.env): VoiceStudioConfig {
  return {
    url: env.VOICESTUDIO_URL?.trim() || 'http://127.0.0.1:3900',
    key: env.VOICESTUDIO_API_KEY?.trim(),
    model: env.VOICESTUDIO_MODEL?.trim(),
    voice: env.VOICESTUDIO_VOICE?.trim(),
  };
}

// Kokoro usa uma janela curta de fonemas. Frases menores evitam que o
// fonemizador pt-BR corte o fim de textos que a API HTTP aceitaria inteiros.
function* splitScript(text: string, maxLength: number): Generator<string> {
  const chars = Array.from(text.trim());
  let start = 0;
  while (start < chars.length) {
    let end = Math.min(start + maxLength, chars.length);
    if (end < chars.length) {
      let space = -1;
      for (let i = end; i > start; i--) {
        if (!/\s/u.test(chars[i])) continue;
        if (space === -1) space = i;
        if (/[.!?]/u.test(chars[i - 1])) {
          space = i;
          break;
        }
      }
      if (space !== -1) end = space;
    }
    const part = chars.slice(start, end).join('').trim();
    if (part) yield part;
    start = end;
    while (start < chars.length && /\s/u.test(chars[start])) start++;
  }
}

// A API entrega PCM mono, 16 bits little-endian, a 24 kHz.
function wav(chunks: Buffer[]): Buffer {
  const length = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(length, 40);
  return Buffer.concat([header, ...chunks]);
}

/**
 * Onde o VoiceStudio não está rodando, o Xilo esconde essas vozes e usa o
 * Edge TTS. Qualquer resposta HTTP conta como "no
 * ar"; o resultado vale por um minuto para não sondar a cada pedido.
 */
export function createStudioProbe(config: VoiceStudioConfig, request = fetch, now: () => number = Date.now): () => Promise<boolean> {
  let checkedAt = -Infinity;
  let available = false;
  let pending: Promise<boolean> | null = null;
  return () => {
    if (now() - checkedAt < 60_000) return Promise.resolve(available);
    pending ??= request(new URL('/', config.url), { signal: AbortSignal.timeout(2_000), redirect: 'manual' })
      .then(async (response) => {
        await response.body?.cancel();
        return true;
      }, () => false)
      .then((result) => {
        available = result;
        checkedAt = now();
        pending = null;
        return result;
      });
    return pending;
  };
}

export function createVoiceStudio(config: VoiceStudioConfig, request = fetch): Narrator {
  return async ({ text, rate, voice: id }) => {
    const style = studioStyle(id);
    if (!style) throw new Error('Estilo do VoiceStudio desconhecido.');
    const custom = id === VOICESTUDIO_ID;
    const model = (custom && config.model) || 'mlx-audio';
    const voice = (custom && config.voice) || (model === 'mlx-audio' ? style.preset : 'default');
    const chunks: Buffer[] = [];
    const signal = AbortSignal.timeout(12 * 60_000);
    for (const input of splitScript(text, model === 'mlx-audio' ? 240 : 4096)) {
      const response = await request(new URL('/v1/audio/speech', config.url), {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}),
        },
        body: JSON.stringify({
          input, model, voice,
          language: 'pt-BR', speed: rate * style.pace, response_format: 'pcm',
        }),
        signal,
      });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'audio/pcm') {
        await response.body?.cancel();
        throw new Error(`Resposta inválida do VoiceStudio (HTTP ${response.status}).`);
      }
      const chunk = Buffer.from(await response.arrayBuffer());
      if (!chunk.length || chunk.length % 2) throw new Error('Áudio PCM incompleto.');
      chunks.push(chunk);
    }
    return { audio: wav(chunks), mimeType: 'audio/wav', words: [] };
  };
}
