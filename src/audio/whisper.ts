// Módulo 1: timestamps por palavra via OpenAI Audio API (Whisper).
//
// O Whisper devolve as palavras sem pontuação e com a grafia dele. Para a
// legenda mostrar exatamente o roteiro, casamos as palavras do roteiro com as
// transcritas (LCS) e herdamos só os tempos.

import type { Timeline, WordTiming } from '../types';
import { wordKey } from '../util';
import { buildTimeline, distribute, tokenizeScript, type ScriptToken } from './aligner';

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function transcribeWithWhisper(
  file: File,
  apiKey: string,
  model: string,
  script: string,
  signal?: AbortSignal,
): Promise<WhisperWord[]> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('O áudio passa de 25 MB, o limite da API de transcrição da OpenAI.');
  }
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  // o roteiro como prompt ajuda o modelo a acertar nomes próprios
  if (script.trim()) form.append('prompt', script.trim().slice(0, 800));

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI respondeu ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { words?: WhisperWord[] };
  const words = (data.words ?? []).filter(
    (w) => typeof w.word === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end),
  );
  if (words.length === 0) throw new Error('A transcrição não trouxe timestamps por palavra.');
  return words;
}

/** Pares (índice no roteiro, índice na transcrição) da maior subsequência comum. */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const table = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] =
        a[i] === b[j]
          ? table[(i + 1) * w + j + 1] + 1
          : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/** Timeline a partir só da transcrição, quando o roteiro não bate com o áudio. */
function timelineFromTranscript(heard: WhisperWord[], duration: number): Timeline {
  const tokens: ScriptToken[] = heard.map((w, i) => {
    const next = heard[i + 1];
    return { text: w.word.trim(), lineEnd: !next || next.start - w.end > 0.6 };
  });
  const words: WordTiming[] = heard.map((w) => ({
    text: w.word.trim(),
    start: w.start,
    end: w.end,
  }));
  return buildTimeline(tokens, words, duration, 'whisper');
}

export function reconcileWithScript(
  script: string,
  heard: WhisperWord[],
  duration: number,
): Timeline {
  const tokens = tokenizeScript(script);
  if (tokens.length === 0) return timelineFromTranscript(heard, duration);

  const pairs = lcsPairs(
    tokens.map((t) => wordKey(t.text)),
    heard.map((w) => wordKey(w.word)),
  );
  // roteiro e narração divergem demais: confia no que foi falado
  if (pairs.length < tokens.length * 0.5) return timelineFromTranscript(heard, duration);

  const words: WordTiming[] = new Array(tokens.length);
  for (const [ti, hi] of pairs) {
    words[ti] = { text: tokens[ti].text, start: heard[hi].start, end: heard[hi].end };
  }

  // palavras do roteiro sem par: reparte o intervalo entre as âncoras vizinhas
  let i = 0;
  while (i < tokens.length) {
    if (words[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && !words[j]) j++;
    const from = i > 0 ? words[i - 1].end : Math.max(0, heard[0].start - 0.2 * (j - i));
    const to = j < tokens.length ? words[j].start : Math.min(duration, from + 0.35 * (j - i));
    const filled = distribute(tokens.slice(i, j), from, Math.max(from, to));
    for (let k = i; k < j; k++) words[k] = filled[k - i];
    i = j;
  }
  return buildTimeline(tokens, words, duration, 'whisper');
}
