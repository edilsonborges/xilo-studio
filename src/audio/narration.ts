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

export async function listVoices(): Promise<{ voices: Voice[]; maxChars: number }> {
  return api('/api/narration/voices');
}

export async function narrate(text: string, voice: string, rate: number): Promise<GeneratedNarration> {
  type Result = { jobId: string } | { audio: string; mimeType: string; words: WhisperWord[] };
  let result = await api<Result>(
    '/api/narration',
    'POST',
    { text, voice, rate },
  );
  while ('jobId' in result) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    result = await api<Result>(`/api/narration/jobs/${encodeURIComponent(result.jobId)}`);
  }
  const binary = atob(result.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const name = `narracao-${voice.replace(/^pt-BR-|Neural$/g, '').toLowerCase()}.${result.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`;
  return { file: new File([bytes], name, { type: result.mimeType }), words: result.words };
}
