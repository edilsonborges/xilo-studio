// Módulo 1: do arquivo de áudio à Timeline (palavras e frases com tempo).

import type { Settings } from '../settings';
import type { Timeline } from '../types';
import { alignLocal, detectSpeechBounds } from './aligner';
import { reconcileWithScript, transcribeWithWhisper, type WhisperWord } from './whisper';

export interface TimelineResult {
  timeline: Timeline;
  /** aviso para a interface quando o caminho com API falhou e caiu no fallback */
  warning?: string;
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error('Não consegui decodificar o áudio. Use um arquivo .mp3 ou .wav válido.');
  } finally {
    void ctx.close();
  }
}

export async function createTimeline(
  script: string,
  file: File,
  buffer: AudioBuffer,
  settings: Settings,
  /** tempos exatos de cada palavra, quando a narração veio do Edge TTS */
  spoken?: WhisperWord[],
): Promise<TimelineResult> {
  const duration = buffer.duration;
  if (spoken?.length) return { timeline: reconcileWithScript(script, spoken, duration, 'edge') };
  const local = (): Timeline => {
    const [from, to] = detectSpeechBounds(buffer);
    return alignLocal(script, duration, from, to);
  };

  const key = settings.openaiKey.trim();
  if (settings.transcription !== 'openai' || !key) return { timeline: local() };

  try {
    const heard = await transcribeWithWhisper(file, key, settings.openaiTranscribeModel, script);
    return { timeline: reconcileWithScript(script, heard, duration) };
  } catch (err) {
    return {
      timeline: local(),
      warning: `Transcrição pela OpenAI falhou (${(err as Error).message}). Usei o alinhador local.`,
    };
  }
}
