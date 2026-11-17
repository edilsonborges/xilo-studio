// Narração com as vozes neurais do Edge TTS (Read Aloud do Microsoft Edge).
// Roda no servidor porque o serviço só aceita a identificação do navegador Edge;
// a página não consegue chamá-lo direto. É um serviço não oficial e pode mudar.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const VOICES = [
  { id: 'pt-BR-AntonioNeural', label: 'Antonio (masculina)' },
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca (feminina)' },
  { id: 'pt-BR-ThalitaMultilingualNeural', label: 'Thalita (feminina, multilíngue)' },
] as const;

export type VoiceId = (typeof VOICES)[number]['id'];

export interface NarrationRequest {
  text: string;
  voice: VoiceId;
  /** 1 é o normal; 0.9 mais lento, 1.15 mais rápido */
  rate: number;
}

export interface SpokenWord {
  word: string;
  start: number;
  end: number;
}

export interface Narration {
  audio: Buffer;
  words: SpokenWord[];
}

export type Narrator = (request: NarrationRequest) => Promise<Narration>;

const TIMEOUT_MS = 90_000;
const TICKS_PER_SECOND = 10_000_000;

// O texto vai dentro de SSML: sem escapar, um "&" ou "<" quebra a síntese.
const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function collectWords(chunk: Buffer, words: SpokenWord[]): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(chunk.toString('utf8'));
  } catch {
    return;
  }
  const items = (parsed as { Metadata?: unknown[] })?.Metadata;
  if (!Array.isArray(items)) return;
  for (const item of items as Array<{ Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string } } }>) {
    const data = item.Data;
    const text = data?.text?.Text;
    if (item.Type !== 'WordBoundary' || typeof text !== 'string' || !Number.isFinite(data?.Offset)) continue;
    const start = data!.Offset! / TICKS_PER_SECOND;
    words.push({ word: text, start, end: start + (data!.Duration ?? 0) / TICKS_PER_SECOND });
  }
}

export const edgeNarrator: Narrator = async ({ text, voice, rate }) => {
  const tts = new MsEdgeTTS();
  const timer = setTimeout(() => tts.close(), TIMEOUT_MS);
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
      sentenceBoundaryEnabled: false,
    });
    const { audioStream, metadataStream } = tts.toStream(escapeXml(text), { rate });
    const chunks: Buffer[] = [];
    const words: SpokenWord[] = [];
    metadataStream?.on('data', (chunk: Buffer) => collectWords(chunk, words));
    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('close', () => resolve());
      audioStream.on('error', reject);
    });
    // os metadados podem chegar logo depois do último pedaço de áudio
    if (metadataStream && !metadataStream.readableEnded) {
      await new Promise<void>((resolve) => {
        metadataStream.on('end', () => resolve());
        metadataStream.on('close', () => resolve());
        setTimeout(resolve, 1_000).unref();
      });
    }
    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error('O Edge TTS não devolveu áudio.');
    words.sort((a, b) => a.start - b.start);
    return { audio, words };
  } finally {
    clearTimeout(timer);
    tts.close();
  }
};
