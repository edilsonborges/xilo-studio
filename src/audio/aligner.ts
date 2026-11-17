// Módulo 1: alinhador local (fallback sem chave) e montagem da Timeline.
//
// Sem transcrição, o melhor palpite é distribuir a duração da fala entre as
// palavras do roteiro proporcionalmente ao tamanho de cada uma, reservando
// pausas onde há pontuação.

import type { SentenceTiming, Timeline, WordTiming } from '../types';
import { clamp, wordKey } from '../util';

export interface ScriptToken {
  text: string;
  /** última palavra de uma linha/parágrafo do roteiro */
  lineEnd: boolean;
}

const SENTENCE_END = /[.!?…]["'”’»)\]]*$/;
const SOFT_PAUSE = /[,]["'”’»)\]]*$/;
const MID_PAUSE = /[;:]["'”’»)\]]*$|[—–]$/;

export function tokenizeScript(script: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  for (const line of script.split(/\n+/)) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    let pushedInLine = false;
    for (const part of parts) {
      if (wordKey(part) === '') {
        // pontuação solta ("!", "—"): cola na palavra anterior
        const prev = tokens[tokens.length - 1];
        if (prev && /^[.,;:!?…—–]+$/.test(part)) prev.text += part;
        continue;
      }
      tokens.push({ text: part, lineEnd: false });
      pushedInLine = true;
    }
    if (pushedInLine) tokens[tokens.length - 1].lineEnd = true;
  }
  return tokens;
}

export const isSentenceEnd = (t: ScriptToken): boolean => t.lineEnd || SENTENCE_END.test(t.text);

/** Peso de fala de uma palavra, em "caracteres equivalentes". */
export function wordWeight(text: string): number {
  const key = wordKey(text);
  const digits = (key.match(/[0-9]/g) ?? []).length;
  // dígitos viram palavras longas quando falados ("1930" = mil novecentos e trinta)
  return Math.max(2, key.length - digits) + digits * 4 + 1.2;
}

/** Pausa depois da palavra, na mesma unidade de wordWeight. */
export function pauseWeight(t: ScriptToken): number {
  if (SENTENCE_END.test(t.text)) return t.lineEnd ? 8 : 6;
  if (t.lineEnd) return 6;
  if (MID_PAUSE.test(t.text)) return 3.5;
  if (SOFT_PAUSE.test(t.text)) return 2.5;
  return 0;
}

/**
 * Distribui [from, to] entre os tokens, proporcionalmente ao peso de cada
 * palavra e às pausas de pontuação. Não reserva pausa depois do último token.
 */
export function distribute(tokens: ScriptToken[], from: number, to: number): WordTiming[] {
  if (tokens.length === 0) return [];
  let total = 0;
  tokens.forEach((t, i) => {
    total += wordWeight(t.text);
    if (i < tokens.length - 1) total += pauseWeight(t);
  });
  const unit = Math.max(0, to - from) / total;
  const out: WordTiming[] = [];
  let cursor = from;
  tokens.forEach((t, i) => {
    const len = wordWeight(t.text) * unit;
    out.push({ text: t.text, start: cursor, end: cursor + len });
    cursor += len;
    if (i < tokens.length - 1) cursor += pauseWeight(t) * unit;
  });
  return out;
}

export function buildTimeline(
  tokens: ScriptToken[],
  words: WordTiming[],
  duration: number,
  source: Timeline['source'],
): Timeline {
  // garante monotonicidade e limites, venha de onde vier
  let prev = 0;
  for (const w of words) {
    w.start = clamp(Number.isFinite(w.start) ? w.start : prev, prev, duration);
    w.end = clamp(Number.isFinite(w.end) ? w.end : w.start, w.start, duration);
    prev = w.start;
  }

  const sentences: SentenceTiming[] = [];
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    if (isSentenceEnd(tokens[i]) || i === words.length - 1) {
      sentences.push({
        text: words
          .slice(first, i + 1)
          .map((w) => w.text)
          .join(' '),
        start: words[first].start,
        end: words[i].end,
        first,
        last: i,
      });
      first = i + 1;
    }
  }
  return { duration, words, sentences, source };
}

export function alignLocal(
  script: string,
  duration: number,
  speechStart = 0,
  speechEnd = duration,
): Timeline {
  const tokens = tokenizeScript(script);
  const from = clamp(speechStart, 0, duration);
  const to = clamp(speechEnd, from, duration);
  const span = to - from > 0.5 ? [from, to] : [0, duration];
  const words = distribute(tokens, span[0], span[1]);
  return buildTimeline(tokens, words, duration, 'local');
}

/**
 * Acha onde a fala começa e termina pelo envelope de energia do áudio, para o
 * alinhador não gastar palavras em silêncio inicial/final.
 */
export function detectSpeechBounds(buffer: AudioBuffer): [number, number] {
  const sr = buffer.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.02));
  const frames = Math.floor(buffer.length / win);
  if (frames < 4) return [0, buffer.duration];

  const rms = new Float32Array(frames);
  const channels = Math.min(2, buffer.numberOfChannels);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const base = f * win;
      for (let i = 0; i < win; i++) {
        const v = data[base + i];
        sum += v * v;
      }
      rms[f] += Math.sqrt(sum / win) / channels;
    }
  }
  let peak = 0;
  for (let f = 0; f < frames; f++) peak = Math.max(peak, rms[f]);
  if (peak < 1e-4) return [0, buffer.duration];

  const threshold = peak * 0.08;
  let firstFrame = 0;
  while (firstFrame < frames && rms[firstFrame] < threshold) firstFrame++;
  let lastFrame = frames - 1;
  while (lastFrame > firstFrame && rms[lastFrame] < threshold) lastFrame--;

  const start = Math.max(0, (firstFrame * win) / sr - 0.04);
  const end = Math.min(buffer.duration, ((lastFrame + 1) * win) / sr + 0.08);
  return end - start > 0.5 ? [start, end] : [0, buffer.duration];
}
