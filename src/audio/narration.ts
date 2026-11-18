import { api } from '../auth/api';
import type { WhisperWord } from './whisper';

export interface Voice {
  id: string;
  label: string;
}

export interface GeneratedNarration {
  file: File;
  words: WhisperWord[];
}

export interface StudioQuality {
  id: string;
  label: string;
  /** segundos de espera por segundo de áudio, em média */
  ratio: number;
}

export interface VoiceList {
  voices: Voice[];
  maxChars: number;
  /** voz inicial sugerida pelo servidor */
  defaultVoice?: string;
  /** presente quando o VoiceStudio do servidor é o OmniVoice, que é lento e tem duas qualidades */
  studio?: { voice: string; qualities: StudioQuality[] } | null;
}

/** Andamento da narração: segundos de áudio prontos, total previsto e tempo decorrido. */
export interface NarrationProgress {
  done: number;
  total: number;
  elapsed: number;
}

export interface NarrateOptions {
  quality?: string;
  onProgress?: (progress: NarrationProgress) => void;
  /** abortar cancela a narração também no servidor */
  signal?: AbortSignal;
}

export async function listVoices(): Promise<VoiceList> {
  return api('/api/narration/voices');
}

export async function narrate(text: string, voice: string, rate: number, options: NarrateOptions = {}): Promise<GeneratedNarration> {
  type Result = { jobId: string; progress?: NarrationProgress } | { audio: string; mimeType: string; words: WhisperWord[] };
  let result = await api<Result>(
    '/api/narration',
    'POST',
    { text, voice, rate, ...(options.quality ? { quality: options.quality } : {}) },
  );
  while ('jobId' in result) {
    const jobId = result.jobId;
    if (result.progress) options.onProgress?.(result.progress);
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (options.signal?.aborted) {
      // o VoiceStudio não para no meio: o servidor diz quanto ainda falta para ele ficar livre
      const stopped = await api<{ busyFor?: number }>(`/api/narration/jobs/${encodeURIComponent(jobId)}`, 'DELETE').catch(() => ({ busyFor: 0 }));
      const wait = stopped.busyFor ?? 0;
      const when = wait < 90 ? `${wait} s` : `${Math.round(wait / 60)} min`;
      throw new DOMException(
        wait > 0 ? `Narração cancelada. O VoiceStudio ainda leva cerca de ${when} para ficar livre; até lá, use uma voz do Edge.` : 'Narração cancelada.',
        'AbortError',
      );
    }
    result = await api<Result>(`/api/narration/jobs/${encodeURIComponent(jobId)}`);
  }
  const binary = atob(result.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const name = `narracao-${voice.replace(/^pt-BR-|Neural$/g, '').toLowerCase()}.${result.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`;
  return { file: new File([bytes], name, { type: result.mimeType }), words: result.words };
}

/** Texto do andamento e fração da barra (0 a 1). `ratio` é a estimativa inicial de lentidão. */
export function describeProgress(progress: NarrationProgress, ratio: number, format: (seconds: number) => string): { fraction: number; text: string } {
  const total = Math.max(progress.total, progress.done, 1);
  if (progress.done <= 0) {
    const left = Math.max(5, total * ratio - progress.elapsed);
    return { fraction: 0.02, text: `Preparando a primeira frase… faltam cerca de ${format(left)}.` };
  }
  // com áudio pronto, a velocidade real corrige a estimativa
  const left = Math.max(3, (progress.elapsed / progress.done) * (total - progress.done));
  return {
    fraction: Math.min(0.98, progress.done / total),
    text: `${format(progress.done)} de cerca de ${format(total)} de áudio prontos · faltam cerca de ${format(left)}.`,
  };
}
