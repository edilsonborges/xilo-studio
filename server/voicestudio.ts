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

/** Voz do VoiceStudio quando o backend só tem o motor OmniVoice (ex.: Docker em CPU). */
export const OMNIVOICE_ID = 'voicestudio-omnivoice';

/**
 * Qualidades do OmniVoice. `ratio` é quantos segundos de processamento cada
 * segundo de áudio custa numa CPU sem GPU (medido no servidor de produção);
 * serve só para a estimativa inicial, que depois é corrigida pelo andamento real.
 */
export const STUDIO_QUALITIES = [
  { id: 'fast', label: 'Rápida', steps: 8, ratio: 11 },
  { id: 'best', label: 'Máxima', steps: 16, ratio: 25 },
] as const;
export type StudioQuality = (typeof STUDIO_QUALITIES)[number]['id'];

export interface StudioState {
  /** o VoiceStudio respondeu */
  up: boolean;
  /** tem o motor mlx-audio (Kokoro): valem os quatro estilos da 0.8.0 */
  kokoro: boolean;
}

/**
 * Confere se o VoiceStudio está no ar e qual motor ele tem. Sem resposta, o
 * Xilo esconde essas vozes e usa o Edge TTS. O resultado vale por um minuto.
 */
export function createStudioProbe(config: VoiceStudioConfig, request = fetch, now: () => number = Date.now): () => Promise<StudioState> {
  let checkedAt = -Infinity;
  let state: StudioState = { up: false, kokoro: false };
  let pending: Promise<StudioState> | null = null;
  return () => {
    if (now() - checkedAt < 60_000) return Promise.resolve(state);
    pending ??= request(new URL('/engines/tts', config.url), {
      signal: AbortSignal.timeout(3_000),
      redirect: 'manual',
      headers: config.key ? { Authorization: `Bearer ${config.key}` } : {},
    })
      .then(async (response): Promise<StudioState> => {
        // respondeu, mas não deu a lista de motores: trata como a instalação da 0.8.0
        if (!response.ok) {
          await response.body?.cancel();
          return { up: true, kokoro: true };
        }
        const body = await response.json().catch(() => null) as { backends?: Array<{ id?: string; available?: boolean }> } | null;
        if (!Array.isArray(body?.backends)) return { up: true, kokoro: true };
        return { up: true, kokoro: body.backends.some((engine) => engine.id === 'mlx-audio' && engine.available === true) };
      }, (): StudioState => ({ up: false, kokoro: false }))
      .then((result) => {
        state = result;
        checkedAt = now();
        pending = null;
        return result;
      });
    return pending;
  };
}

/** Segundos de áudio que um texto deve render, para a estimativa de espera. */
export const estimateAudioSeconds = (text: string, rate: number): number =>
  Math.max(1, text.trim().split(/\s+/).filter(Boolean).length / 2.3 / rate);

/**
 * Narração pelo motor OmniVoice. Um pedido só, para a voz não mudar no meio; o
 * áudio chega aos poucos (frase a frase), o que dá o andamento real.
 * O backend não interrompe uma fala já começada: abandonar o pedido não libera
 * o processador, então quem chama deve esperar o fim mesmo ao cancelar.
 */
export function createOmniVoice(config: VoiceStudioConfig, request = fetch): Narrator {
  return async ({ text, rate, quality, onProgress, signal }) => {
    const steps = STUDIO_QUALITIES.find((q) => q.id === quality)?.steps ?? STUDIO_QUALITIES[0].steps;
    const limit = AbortSignal.timeout(45 * 60_000);
    const chunks: Buffer[] = [];
    let bytes = 0;
    // a API aceita até 4096 caracteres por pedido; a mesma semente mantém a voz entre os pedidos
    const seed = Math.floor(Math.random() * 1_000_000);
    const parts = [...splitScript(text, 3800)];
    for (const input of parts) {
      const response = await request(new URL('/v1/audio/speech', config.url), {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}),
        },
        body: JSON.stringify({
          input, model: 'omnivoice', language: 'pt-BR', speed: rate,
          response_format: 'pcm', stream_format: 'audio', num_step: steps,
          ...(parts.length > 1 ? { seed } : {}),
        }),
        signal: signal ? AbortSignal.any([signal, limit]) : limit,
      });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'audio/pcm' || !response.body) {
        await response.body?.cancel();
        throw new Error(`Resposta inválida do VoiceStudio (HTTP ${response.status}).`);
      }
      for await (const piece of response.body as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(piece));
        bytes += piece.length;
        // PCM mono, 16 bits, 24 kHz: 48.000 bytes por segundo
        onProgress?.(bytes / 48_000);
      }
    }
    if (!bytes || bytes % 2) throw new Error('Áudio PCM incompleto.');
    return { audio: wav(chunks), mimeType: 'audio/wav', words: [] };
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
